/*
 * MPCT Controller Client
 * 
 * (C) 2018 jowe.ca
 * 
 * 
 * 
 * 
 * MQTT receivable command message format:
 * 
 * { "params":[{"name":"[name]",arguments...}] }
 * 
 * Controller coammand parameters receivable via MQTT:
 * 
 * - Trigger broadcast of full status for all devices, either from latest readings or force immediate hardware read
 * 		{"name":"publishFullStatus","forceHardwareRead":bool}
 * 
 * 
 * 
 */

require('./tools.js')(); 
var _=require('lodash');
var fs=require("fs");
var mqtt=require('mqtt');
var diskusage=require('diskusage');
//var mqttClient;

//Device modules
var Mpct_flowSensor=require('./devlib/class_mpct_flowSensor.js');
var Mpct_switch=require('./devlib/class_mpct_switch.js');
var Mpct_ds18b20=require('./devlib/class_mpct_ds18b20.js');
var Mpct_dht22=require('./devlib/class_mpct_dht22.js');
var Mpct_relay=require('./devlib/class_mpct_relay.js');
var Mpct_projector=require('./devlib/class_mpct_projector.js');
var Mpct_sim_switch=require('./devlib/class_mpct_sim_switch.js');

//Controller module
var Mpct_controller=require('./devlib/class_mpct_controller.js');

//Keep a handler to each device listed in config.devices
//Live device data will be available at deviceHandlers[n].device
var deviceHandlers=[];

//Instance of controller module will be globally available
var controllerInstance;

//Will be populated with contents from config.json and will carry live data for devices
var config={}; 

function initDevices(){
	log("Initializing controller module","init");
	controllerInstance=new Mpct_controller(config.controller,log,publishControllerStatus);
	log("Initializing local devices","init");
	var devices=config.devices;
	for (var n=0;n<devices.length;n++){
		devices[n].physical.localId=n;
		devices[n].physical.uid=config.controller.controllerId+devices[n].physical.localId+"."+devices[n].physical.type;
		//Initialize relays and anything else that uses output switching
		if (["relay","led","buzzer"].includes(devices[n].physical.type)){
			deviceHandlers[n]=new Mpct_relay(devices[n],log,publishDeviceStatus);
		} else if (devices[n].physical.type=="dht22"){
			deviceHandlers[n]=new Mpct_dht22(devices[n],log,publishDeviceStatus);
		} else if (devices[n].physical.type=="ds18b20"){
			deviceHandlers[n]=new Mpct_ds18b20(devices[n],log,publishDeviceStatus);
		} else if (devices[n].physical.type=="switch"){
			deviceHandlers[n]=new Mpct_switch(devices[n],log,publishDeviceStatus);
		} else if (devices[n].physical.type=="flowSensor"){
			deviceHandlers[n]=new Mpct_flowSensor(devices[n],log,publishDeviceStatus);
		} else if (devices[n].physical.type=="projector"){
			deviceHandlers[n]=new Mpct_projector(devices[n],log,publishDeviceStatus);
		} else if (devices[n].physical.type=="sim_switch"){
			deviceHandlers[n]=new Mpct_sim_switch(devices[n],log,publishDeviceStatus);
		}
		if (!deviceHandlers[n]){
			log("Device registration failed for "+devices[n].physical.uid+". Unknown device type (\""+devices[n].physical.type+"\"). Please check config.json. Exiting...","init");
			process.exit(1);
		}
		log("Registered device "+devices[n].physical.uid,"init");
	}
	log("# of devices registered on this controller: "+n,"init");
}

//Publish status of given device
function publishDeviceStatus(device,error,publishFullDeviceRecord){
	var msg;
	if (publishFullDeviceRecord || error){
		//Make a temporary copy of the device record to add _isFullUpdate flag (bad workaround)
		var deviceCopy={};
		deepCopy(device,deviceCopy);
		deviceCopy._isFullUpdate=true; //This flag causes the mpctserver to REPLACE its entire in-memory record for this device (drops deleted fields)
		msg=JSON.stringify(deviceCopy);
	} else {
		if (device.error){
			msg='{"data":'+JSON.stringify(device.data)+',"error":'+JSON.stringify(device.error)+'}';
		} else {
			msg='{"data":'+JSON.stringify(device.data)+',"error":false}';
		} 			
	}
	publish("update/"+device.physical.uid,msg);
}

//Publish status of controller (without triggering read)
function publishControllerStatus(){
	config.controller.localTimestamp=new Date().getTime();
	publish("update/controllers",JSON.stringify(config.controller));
}

//Publish status of all locally connected devices and controller
function publishMyStatus(){
	for (n=0;n<config.devices.length;n++){
		publishDeviceStatus(config.devices[n],false,true); //last flag: publishFullDeviceRecord, not just params
	}
	publishControllerStatus();
}

//Trigger read on all devices (live data updated in config.devices), optionally publish full status after
function readDevices(publishFullStatus){	
	log("Reading all devices...","hardware");

	//Function "done" (lodash library) needs to be called devices.length+1 times to execute callback
	var done = _.after(config.devices.length+1, function() {	
		log("Done reading from all devices.","hardware");
		if (publishFullStatus){
			publishMyStatus();
		}
	});

	//Trigger read on each device
	for (n=0;n<config.devices.length;n++){
		deviceHandlers[n].read(function(device){
			done();
		});
	}
	
	//Trigger read on controller status
	controllerInstance.read(function(){
		done();
	});
}

//Subscribe and log
function subscribe(topic,options,callback){
	var fullTopic="#";
	if (topic){
		var fullTopic=config.controller.mqttNamespace+topic;
	}
	mqttClient.subscribe(fullTopic,options,function(err,granted){
		if (err) {
			log("Subscription to "+fullTopic+" failed","mqtt",true);
		} else {
			log("Subscribed successfully to "+granted[0].topic+" with QOS "+granted[0].qos,"mqtt");
		}
		//After logging, call original callback if exists
		if (callback) callback(err,granted);
	});
}

//Publish and log
function publish(topic,message){
	var fullTopic=config.controller.mqttNamespace+topic;
	mqttClient.publish(fullTopic,message,function(err){
		if (err) {
			log("Publishing to "+fullTopic+" failed","mqtt",true);
		} else {
			log("Published to "+fullTopic+": "+message,"mqtt"); 
		}
	});
}

function startMqttClient(mqttNamespace){	
	var controller=config.controller;
	log("Attempting MQTT connection to broker @ "+controller.mqttBrokerAddress,"mqtt");
	mqttClient=mqtt.connect(controller.mqttBrokerAddress);

	mqttClient.on('connect', function () {
		controller.controllerIP=myIP();
		log("Connected to "+controller.mqttBrokerAddress,"mqtt");
		//Subscribe to command channels for for controller and local devices
		subscribe("command/controllers");
		for(n=0;n<config.devices.length;n++){
			subscribe("command/"+config.devices[n].physical.uid);
		}
		//After connceting to MQTT server successfully, publish full status initially and then at intervals (as specified in config.json)
		readDevices(true);
		if (controller.publishFullStatusInterval>1000){
			setInterval(function(){readDevices(true);},controller.publishFullStatusInterval);		
			log("Full status will be published every "+controller.publishFullStatusInterval+" ms","init");
		} else {
			log("Interval publishing of full status is DISABLED","init");
		}
	});
 
	mqttClient.on('message', function (topic, message) {
		var command={}; //Will be JSON from message

		try {
			command=JSON.parse(message.toString());
			//log("Message @ "+topic+": "+message.toString(),"mqtt");
		} catch(err) {
			log("Received invalid MPCT or MQTT message (JSON syntax error): "+message.toString(),"mqtt",true);
			return;
		}

		if (topic==controller.mqttNamespace+"command/controllers"){
			//Caught controller command
			log("Controller command received (all controllers)","mpct");
			if (command.data){
				for (cmd in command.data){
					if (cmd=="publishFullStatus"){
						log("Executing remotely issued controller command: "+cmd,"mpct");
						if (command.data[cmd].forceHardwareRead && command.data[cmd].forceHardwareRead===true){
							log("Forcing hardware read","mpct");
							readDevices(true);
						} else {							
							publishMyStatus();
						}
					} else {
						log("Unknown controller command: "+cmd,"mpct",true);
					}					
				}
			} else {
				log("Received controller command was empty","mpct",true);				
			}
		}
		
		if (isChildTopicOf(controller.mqttNamespace+"command/"+controller.controllerId,topic)){
			//Caught command for one of our devices
			for (var i=0;i<config.devices.length;i++){
				var thisDevice;
				if (topic==controller.mqttNamespace+"command/"+config.devices[i].physical.uid){
					thisDevice=config.devices[i];
					thisDeviceHandler=deviceHandlers[i];
					if (command.deleteMeta){
						//Command has request to delete a meta field
						log("Metadata deletion for device "+config.devices[i].physical.uid+": "+command.deleteMeta,"mpct");
						delete config.devices[i].meta[command.deleteMeta];
						//After meta deletion, publish full status
						publishDeviceStatus(thisDevice,false,true);
					}
					if (command.meta){
						//Command has meta-field(s)
						Object.keys(command.meta).forEach(function(thisParam){
							thisValue=command.meta[thisParam];
							config.devices[i].meta[thisParam]=thisValue;
							log("Metadata for device "+config.devices[i].physical.uid+": "+thisParam+" -> "+thisValue,"mpct");
						});
						//After meta update, publish full devices status (results in two updates in case command had params too, but that's ok)
						publishDeviceStatus(thisDevice,false,true);
					}
					if (command.data){
						//Command has parameter(s) 
						thisDeviceHandler.execCommand(command);
						//Store device status in case of unexpected crash/restart
						if (controller.hasOwnProperty("saveDeviceStateOnUpdate") && controller.saveDeviceStateOnUpdate==1){
							writeJson(config.devices,'./deviceSettings.json');							
						}
					}
				}
			}							
		}

	});
	

}

function startup(){	
	log("Welcome - MPCT controller starting up...","init",false,true);
	//Read config file synchronously
	//config=readConfigJson();
	//Read status.json if extant (else fallback to config.json)
	config=readConfigJson();
	//Read device settings
	config.devices=readJson("deviceSettings.json",false);
	if (!config.devices){
		config.devices={};
		log("Could not load webSettings, reverting to config.json","fs");
		config=readConfigJson();
	}
	
	if ((config.controller.mpctClientType=="controllerClient") && (config.controller.controllerId!="")){
		//Got correct client type and controller ID
		log("This is controller "+config.controller.controllerId,"init");
	} else {
		log("Wrong clientType "+config.controller.clientType+" in config.json","init",true);
		process.exit(1);
	}
	//Init physical devices and set interval to read from them and save full status (as specified in config.json) 
	initDevices();
	//Connect to MQTT server
	startMqttClient(config.controller.mqttNamespace);
}

/*
 * Graceful shutdown logic
 */

//Check if any device is currently being read from or written to asynchronously
function checkAsyncActivity(){
	var stillBusy=false;
	var busyDevices=[];
	for (var i=0;i<deviceHandlers.length;i++){
		if (deviceHandlers[i].device.status.busy){
			stillBusy=true; 
			busyDevices.push(deviceHandlers[i].device);
		}
	}
	if (stillBusy){
		//Make list of devices that are still busy
		busyDevicesList="";
		busyDevices.forEach(function(device){
			busyDevicesList+=device.physical.uid+" ";
		});
		log("Still busy: "+busyDevicesList,"init");		
	} else {
		log("All done.","init");
	}
	return stillBusy;
}

function checkAsyncAndExit(){
	if (!checkAsyncActivity()){
		
	    //Save only deviceSettings to disk, not entire config object
	    writeJson(config.devices,'./deviceSettings.json',function(){
	        log("Exiting. Goodbye!\n","init",false,true);
	        process.exit(1);    	
	    });
		
	    /*//Store config object in status.json before leaving (for debugging purposes)
	    writeStatusJson(config,function(){
	        log("Exiting. Goodbye!\n","init",false,true);
	        process.exit();    	
	    });
	    */
	} else {
		setTimeout(checkAsyncAndExit,500);
	}	
}

process.on('SIGINT', function() {
    log("Caught CTRL-C/SIGINT, shutting down...","init");
    //Kill reporting intervals for each device
    deviceHandlers.forEach(function(dh){
    	dh.clearReportingInterval();
    });
    log("Waiting for asynchronous tasks to finish...","init");
    checkAsyncAndExit();
});

/*
 * Graceful shutdown Logic ends
 */

startup();


