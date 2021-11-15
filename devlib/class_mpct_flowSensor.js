/*
 * Flow sensor - interrupt 
 */

/*
 *	Device config example (config.json): 
 * 
		{"type":"flowSensor",
			"gpio":25,
			"reportingInterval":10000,			//Query the sensor at this interval and publish pulse count, unless...
			"reportInactiveIntervals":false		//...there was no activity during the current interval
		}
*/

/*
 * Device params:
 * 		{"flow":count,interval,lastReset,actualCycleLength,readAt}
 */

var intervalHandler;

var Gpio=require('onoff').Gpio;

function Mpct_flowSensor(device,log,publishDeviceStatus){
	//Device record
	this.device=device; 
	//Functions
	this.log=log;
	this.publishDeviceStatus=publishDeviceStatus;
	//Initialize...
	this.log("Initializing device "+device.physical.uid+" on GPIO "+device.physical.gpio,"hardware");
	this.device.error=false;
	//Get interrupt handler, watch rising edge
	this.handler=new Gpio(device.physical.gpio,'in','rising');  	
	//Attach interrupt to watch pulses
	this.watch(function(err,device){
		if (err){
			publishDeviceStatus(device,true);
		}
	});
	//Init flow parameter
	var now=new Date().getTime()
	device.data.flow={
			"interval":this.device.config.reportingInterval,
			"count":0,
			"lastReset":now,
			"actualCycleLength":false,
			"readAt":now
	};
	//Set interval timer for reporting
	this.setReportingInterval(function(device){
		//Reporting interval has expired: report if there was activity or reportInactiveIntervals is set
		var now=new Date().getTime();
		device.data.flow.actualCycleLength=now-device.data.flow.lastReset;
		device.data.flow.lastReset=now;
	    device.data.flow.readAt=now;
		if (device.data.flow.count>0 || device.config.reportInactiveIntervals){
			publishDeviceStatus(device)					
		}
		//Reset counter
		device.data.flow.count=0;
	});
	
}

//Use setInverval() to assign a callback to be executed at the given reporting interval
Mpct_flowSensor.prototype.setReportingInterval=function (callback,newInterval){
	//Clear old interval handler if exists
	if (this.intervalHandler){
		clearInterval(this.intervalHandler);
	}
	//Use specified interval if exists, or else default to device record
	if (newInterval){
		this.device.config.reportingInterval=newInterval;
	}
	//Don't allow for intervals shorter than minimum
	var t=Math.max(5000,this.device.config.reportingInterval); 
	//Set new interval handler
	log("Setting reporting interval handler for "+this.device.physical.uid+" at "+t+" ms","hardware");
	var device=this.device;
	this.intervalHandler=setInterval(function(){
		if (callback) callback(device);
	},t); 	
}


Mpct_flowSensor.prototype.watch=function(callback){
  var device=this.device;
  //Watch for hardware interrupt
  this.handler.watch(function (err, value) { 
    if (err) {
      log("Error on input interrupt for "+device.physical.type+" at GPIO"+device.physical.gpio+": "+err,"hardware",true);
      device.error="Error on input interrupt";
      return;
    }
    device.error=false;
    //Count this pulse
    device.data.flow.count++;    
    //Update device status (mode = reading mode: interrupt)
    log("Activity on "+device.physical.type+" at GPIO"+device.physical.gpio+" (mode/raw/counter): interrupt/"+value+"/"+device.data.flow.count,"hardware");
    if (callback) callback(err,device);
  });	
}

//This is a dummy: indicate to caller that reading process is done (can't read directly from flowSensor)
Mpct_flowSensor.prototype.read=function(callback){
	if (callback) callback(this.device);	
}

Mpct_flowSensor.prototype.execCommand=function(command,callback){
	log("Device "+this.device.physical.uid+" at GPIO"+this.device.physical.gpio+" does not accept commands: "+JSON.stringify(command),"hardware",true);
	if (callback) callback(false);
}

Mpct_flowSensor.prototype.clearReportingInterval=function(command,callback){
	//Clear old interval handler if exists
	if (this.intervalHandler){
		log("Clearing reporting for "+this.device.physical.uid+" at GPIO"+this.device.physical.gpio,"hardware");
		clearInterval(this.intervalHandler);
	}	
	if (callback) callback();
}



module.exports=Mpct_flowSensor;