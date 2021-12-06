/*
 * Read/write a push button, rocker switch or other input switching 
 */

/*
 * 	Device config example (config.json):
 *
		{"type":"switch",
			"gpio":15
		}, 
*/

var Gpio=require('onoff').Gpio;

function Mpct_switch(device,log,publishDeviceStatus){
	//Device record
	this.device=device; 
	//Functions
	this.log=log;
	this.publishDeviceStatus=publishDeviceStatus;
	//Initialize...
	this.log("Initializing device "+device.physical.uid+" on GPIO "+device.physical.gpio,"hardware");
	this.device.error=false;
	//Get interrupt handler, watch both edges
	this.handler=new Gpio(device.physical.gpio,'in','both',{debounceTimeout: 500});  	
	//Attach interrupt to watch pulses
	this.watch(function(err,device){
		if (err){
			publishDeviceStatus(device,true);
		} else {
			publishDeviceStatus(device);
		}
	});	
}

function updateDeviceStatus(device,value,readMode){
  device.data.status={"value":!value,"raw":value,"readMode":readMode,"readAt":new Date().getTime()};
}

Mpct_switch.prototype.watch=function(callback){
  var device=this.device;
  //Watch for hardware interrupt
  this.handler.watch(function (err, value) { 
    if (err) {
      log("Error on input interrupt for "+device.physical.type+" at GPIO"+device.physical.gpio+": "+err,"hardware",true);
      device.error="Error on input interrupt";      
      return;
    }
    device.error=false;
    //Update device status (mode = reading mode: interrupt)
    updateDeviceStatus(device,value,"interrupt");
    log("State change on "+device.physical.type+" at GPIO"+device.physical.gpio+" (mode/raw): interrupt/"+value,"hardware");
    if (callback) callback(err,device);
  });	
}

Mpct_switch.prototype.read=function(callback){
  //Call the read function on the onoff module
  var value=this.handler.readSync();
  log("Reading from "+this.device.physical.type+" at GPIO"+this.device.physical.gpio+" (mode/raw): manual/"+value,"hardware");
  //Update device status (mode = reading mode: manual function call)
  updateDeviceStatus(this.device,value,"manual");
  if (callback) callback(this.device);
}

Mpct_switch.prototype.execCommand=function(command,callback){
	log("Device "+this.device.physical.uid+" at GPIO"+this.device.physical.gpio+" does not accept commands: "+JSON.stringify(command),"hardware",true);
	if (callback) callback(false);
}

Mpct_switch.prototype.clearReportingInterval=function(command,callback){
	//Clear old interval handler if exists
	if (this.intervalHandler){
		log("Clearing reporting for "+this.device.physical.uid+" at GPIO"+this.device.physical.gpio,"hardware");
		clearInterval(this.intervalHandler);
	}	
	if (callback) callback();
}

	
module.exports=Mpct_switch;
