/*
 * Read/write a relay 
 */

/*
 *	Device config examples (config.json):
 * 
		{"type":"relay",
			"gpio":17
		},
		{"type":"led",
			"gpio":3
		},
		{"type":"buzzer",
			"gpio":
		},



	Relays need meta:{"function":[function]} for macros
	[function] can be, for example:
		"heater"
		"fan"
		"ac"
		"light"
		"feed"
		"amp"
		
	These can be declared here or remotely via device commands

*/

/*
 * Device params:
 * 		{"status":value,readAt}
 */

var Gpio=require('onoff').Gpio;


var handler; //GPIO handler

function Mpct_relay(device,log,publishDeviceStatus){
	//Device record
	this.device=device; 
	//Functions
	this.log=log;
	this.publishDeviceStatus=publishDeviceStatus;
	this.log("Initializing device "+device.physical.uid+" on GPIO "+device.physical.gpio,"hardware");
	//Get gpio handler for output channel
	this.handler=new Gpio(device.physical.gpio,'out');
	//Init status data: if no value present default to false (off)
	if (!this.device.data.status) this.device.data.status={"value":false};
	//Flush the initial value to the hardware
	this.write(this.device.data.status.value,true);
	this.device.error=false;
}

Mpct_relay.prototype.read=function(callback){
  //Call the read function on the onoff module
  var value=this.handler.readSync();
  log("Reading from "+this.device.physical.type+" at GPIO"+this.device.physical.gpio+" (raw): "+value,"hardware");
  this.device.data.status={"value":value,"readAt":new Date().getTime()};
  if (callback)callback(this.device);
  return this.device.data.status;
  
}

//The noPublish flag is to suppress broadcast for the initial call at startup/init as mqtt isn't up yet
Mpct_relay.prototype.write=function(value,noPublish){
  var device=this.device;
  //Call the write function n the onoff module
  value ? value=1 : value=0;
  try {
	  this.handler.writeSync(value);
	  device.data.status={"value":value,"readAt":new Date().getTime()};	  
	  log("Writing to "+device.physical.type+" at GPIO"+device.physical.gpio+" (raw): "+value,"hardware");
	  this.device.error=false;
	  if (!noPublish) this.publishDeviceStatus(this.device);
	  return true;
  } catch(err) {
	  this.device.error=true;
	  log("Error writing to "+device.physical.type+" at GPIO"+device.physical.gpio+" (raw): "+value,"hardware",true);
	  if (!noPublish) this.publishDeviceStatus(this.device,true);
	  return false;
  }
}

Mpct_relay.prototype.execCommand=function(command,callback){
	//Check if forceWrite is set: write to device even if status isn't changing
	var forceWrite;
	var success=true;
	(command.data.hasOwnProperty("forceWrite") && command.data.forceWrite) ? forceWrite=true : forceWrite=false;
	if (command.data.hasOwnProperty("status")){
		//Only write if status is actually changing or forceWrite=true
		if (command.data.status.value!=this.device.data.status.value || forceWrite){
			var success=this.write(command.data.status.value);			
		}
	}	
	if (callback) callback(success);
}

Mpct_relay.prototype.clearReportingInterval=function(command,callback){
	//Clear old interval handler if exists
	if (this.intervalHandler){
		log("Clearing reporting for "+this.device.physical.uid+" at GPIO"+this.device.physical.gpio,"hardware");
		clearInterval(this.intervalHandler);
	}	
	if (callback) callback();
}

module.exports=Mpct_relay;
