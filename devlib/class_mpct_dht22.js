/*
 * Read a DHT22 sensor 
 * 
 * Relies on a python script, dht22.py, in the devlib directory.
 * To install the python stuff:
 * 
 * 
 * 	sudo apt-get install build-essential python-dev python-openssl
 *  cd /home/pi
 *  sudo apt-get install git
 *  git clone https://github.com/adafruit/Adafruit_Python_DHT.git
 *  
 */

/*
 *	Device config example (config.json): 
 *
		{"type":"dht22",
			"gpio":22,
			"maxDeltaHumidity":10,				//Consider readings with a greater delta to previousValue as invalid
			"maxDeltaTemperature":3,			//Consider readings with a greater delta to previousValue as invalid
			"reportingInterval":10000,			//Query the sensor at this interval and publish reading, unless...
			"reportInactiveIntervals":false		//...the reading didn't change from the previous query
		},
*/

/*
 * Device params:
 * 		{"temperature":value,previousValue,unit,readAt}
 * 		{"humidity":value,previousValue,unit,readAt}
 */

var exec = require('child_process').exec

var intervalHandler;

function Mpct_dht22(device,log,publishDeviceStatus){
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
	this.setReportingInterval(function(dht22){		
		//Reporting interval has expired: report temperature
		dht22.read(function(device,err,change){
			if (err){
				publishDeviceStatus(device,true);
			} else if (device.reportInactiveIntervals || change){
				publishDeviceStatus(device);					
			}
		});
	});		
}

//Use setInverval() to assign a callback to be executed at the given reporting interval
Mpct_dht22.prototype.setReportingInterval=function (callback,newInterval){
	//Init data parameters
	this.device.data.temperature={"value":false,"unit":"\u2103","previousValue":false};
	this.device.data.humidity={"value":false,"unit":"%","previousValue":false};
	//Clear old interval handler if exists
	this.clearReportingInterval();
	//Use specified interval if exists, or else default to device record
	if (newInterval){
		this.device.config.reportingInterval=newInterval;
	}
	//Don't allow for intervals shorter than minimum
	var t=Math.max(5000,this.device.config.reportingInterval);
	//Set new interval handler
	log("Setting reporting interval handler for "+this.device.physical.uid+" at "+t+" ms","hardware");
	var dht22=this;
	this.intervalHandler=setInterval(function(){		
		if (callback) callback(dht22);
	},t); 	
}

Mpct_dht22.prototype.read=function(callback){	
	var device=this.device;
	var error=false;
	var temperatureDelta=0,humidityDelta=0;
	device.status.busy=true; //Flag busy reading
	exec('python '+__dirname+'/dht22.py', function(err, stdout, stderr){		
	  device.status.busy=false;
	  if (err) {
	      //Node couldn't execute the command
		  error=true;
		  device.error="Could not execute sensor reading: "+stderr;
	  } else {
		  try {
			  m=JSON.parse(stdout);
			  if (m.error){ error=true; }
		  } catch (e){
			  error=true;
			  device.error="Invalid JSON from device: "+stdout;
		  }
		  //Readings plausible?
		  if (!error){
			  temperatureDelta=Math.abs(m.temperature-device.data.temperature.value);
			  humidityDelta=Math.abs(m.humidity-device.data.humidity.value);
			  if (temperatureDelta>device.config.maxDeltaTemperature && device.data.temperature.value){
				  //Temperature reading implausible
				  error=true;
				  device.error="Implausible temperature reading: (actual delta/allowed maximum -> "+temperatureDelta+"/"+device.config.maxDeltaTemperature+") ";
				  device.data.temperature.value="N/A";
			  }
			  if (humidityDelta>device.config.maxDeltaHumidity && device.data.humidity.value){
				  //Humidity reading implausible
				  error=true;
				  device.error="Implausible humidity reading: (actual delta/allowed maximum -> "+humidityDelta+"/"+device.config.maxDeltaHumidity+") ";
				  device.data.humidity.value="N/A";
			  }
			  if (!error){
				  //Still no error: Reading appears valid
				  //Update device status
				  device.data.temperature.previousValue=device.data.temperature.value;
				  device.data.humidity.previousValue=device.data.humidity.value;
				  device.data.temperature.value=m.temperature;
				  device.data.humidity.value=m.humidity;
				  device.data.temperature.readAt=new Date().getTime();
				  device.data.humidity.readAt=new Date().getTime();
				  device.error=false;
			  }		  		  
			  
		  }
	  }
	  //Log
	  if (error){
		  log("Error reading dht22 at GPIO"+device.physical.gpio+" failed: "+device.error,"hardware",true);
	  } else {
		  log("Reading from dht22 at GPIO"+device.physical.gpio+": "+device.data.temperature.value+"/"+device.data.humidity.value+" (temperature/humidity)","hardware");		  
	  }
	  if (callback) callback(device,error,temperatureDelta>0 || humidityDelta>0);
	});
}

Mpct_dht22.prototype.execCommand=function(command,callback){
	log("Device "+this.device.physical.uid+" at GPIO"+this.device.physical.gpio+" does not accept commands: "+JSON.stringify(command),"hardware",true);
	if (callback) callback(false);
}

Mpct_dht22.prototype.clearReportingInterval=function(command,callback){
	//Clear old interval handler if exists
	if (this.intervalHandler){
		log("Clearing reporting for "+this.device.physical.uid+" at GPIO"+this.device.physical.gpio,"hardware");
		clearInterval(this.intervalHandler);
	}	
	if (callback) callback();
}

module.exports=Mpct_dht22;
