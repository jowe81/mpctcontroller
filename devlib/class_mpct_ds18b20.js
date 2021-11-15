/*
 * Read a DS18B20 sensor
 * 
 *  
 *  To get RPI ready for DS18B20:
 *  	(1) In /boot/config.txt, add "dtoverlay=w1-gpio" for OneWire devices on GPIO4
 *  		For other pins: "dtoverlay=w1-gpio,gpiopin=x"
 *  	(2) Afte reboot, type:
 *  		sudo modprobe w1-gpio
 *  		sudo modprobe w1-therm
 *  		cd /sys/bus/w1/devices
 *  		ls
 *  		cd 28-xxxx (change this to match what serial number pops up)
 *  		cat w1_slave 
 *  
 */

/*
 *	Device config example (config.json):
 * 
		{"type":"ds18b20",
			"address":"28-031645e55bff",		//OneWire address of this sensor
			"gpio":4,							//OneWire bus (GPIO 4 is default, custom GPIO currently not implemented in this library)
			"maxDeltaTemperature":3,			//Consider readings with a greater delta to previousValue as invalid
			"reportingInterval":10000,			//Query the sensor at this interval and publish reading, unless...
			"reportInactiveIntervals":false		//...the reading didn't change from the previous query
		},
*/

/*
 * Device params:
 * 		{"temperature":value,previousValue,unit,readAt}
 */


var ds18b20 = require('ds18b20');

var intervalHandler;
	
function Mpct_ds18b20(device,log,publishDeviceStatus){
	//Device record
	this.device=device; 
	//If reportingInterval is missing, default to 10s
	if (!this.device.config.reportingInterval){
		this.device.config.reportingInterval=10000;
	}
	//Functions
	this.log=log;
	this.publishDeviceStatus=publishDeviceStatus;
	this.log("Initializing device "+device.physical.uid+" on GPIO "+device.physical.gpio,"hardware");
	//Set interval timer for reporting
	this.setReportingInterval(function(ds18b20){		
		//Reporting interval has expired: report temperature
		ds18b20.read(function(device,err,change){
			if (err){
				publishDeviceStatus(ds18b20.device,true);
			} else if (device.reportInactiveIntervals || change){
				publishDeviceStatus(ds18b20.device);					
			}
		});
	});	
}

//Use setInverval() to assign a callback to be executed at the given reporting interval
Mpct_ds18b20.prototype.setReportingInterval=function (callback,newInterval){
	//Init temperature parameter
	this.device.data.temperature={"value":false,"unit":"\u2103","previousValue":false};
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
	var ds18b20=this;
	this.intervalHandler=setInterval(function(){		
		if (callback) callback(ds18b20);
	},t); 	
}



Mpct_ds18b20.prototype.read=function(callback){
	var device=this.device;
	device.status.busy=true;//Flag busy reading
	ds18b20.temperature(device.physical.address, function(err, value) {
		device.status.busy=false;
		//Save previous value if exists
		device.data.temperature ? previousValue=device.data.temperature.value : previousValue=false;
		//Analyze change from previous reading
		var temperatureDelta=Math.abs(value-previousValue);
		//Check for errors
		var error=false;
		if (err){
			//Hardware error during reading
			error=true;
			device.error="Sensor reading failed: "+err;				
			log("Reading from ds18b20 at GPIO"+device.physical.gpio+" with address "+device.physical.address+" failed: "+err,"hardware",true);			
		} else {
			//Reading successful on hardware side
			log("Reading from ds18b20 at GPIO"+device.physical.gpio+" with address "+device.physical.address+": "+value,"hardware");
			if (previousValue && temperatureDelta>device.config.maxDeltaTemperature){
				//Error because of implausible reading
				error=true;
				/*  
				 * Discard value (flag error) because the maximum delta was exceeded
				 * This should catch weird readings like 85 or 127, but allow 0 when it's reasonably probable
				*/
				device.error="Implausible temperature reading: (actual delta/allowed maximum -> "+delta+"/"+device.config.maxDeltaTemperature+") ";
			} else {
				//Got good data: No hardware error and plausible reading
				//Update device record
				device.data.temperature.value=value;
				device.data.temperature.previousValue=previousValue;
				device.data.temperature.readAt=new Date().getTime();
				device.error=false;
			}
		}
		if (callback) callback(device,error,temperatureDelta>0);
	});

}

Mpct_ds18b20.prototype.execCommand=function(command,callback){
	log("Device "+this.device.physical.uid+" at GPIO"+this.device.physical.gpio+" does not accept commands: "+JSON.stringify(command),"hardware",true);
	if (callback) callback(false);
}

Mpct_ds18b20.prototype.clearReportingInterval=function(command,callback){
	//Clear old interval handler if exists
	if (this.intervalHandler){
		log("Clearing reporting for "+this.device.physical.uid+" at GPIO"+this.device.physical.gpio,"hardware");
		clearInterval(this.intervalHandler);
	}	
	if (callback) callback();
}


module.exports=Mpct_ds18b20;
