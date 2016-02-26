/**
 * Copyright 2016 ARRIS Enterprises, Inc. All rights reserved.
 * This program is confidential and proprietary to ARRIS Enterprises, Inc. (ARRIS),
 * and may not be copied, reproduced, modified, disclosed to others, published or used,
 * in whole or in part, without the express prior written permission of ARRIS.
 */

/**
 * This module generates docker compose file and ansible playbooks based on 
 * manifest file info and run ansible to deploy the applications
 */

/**
 * Import modules
 */
var appLogger = require('../utils/app_logger');
var PlaybookGenerator = require('../modules/PlaybookGenerator');
var NerveConfigGenerator = require('../modules/NerveConfigGenerator');
var AppInstallError = require('../modules/AppInstallError');
var Persistence = require('../modules/Persistence');
var GlobalsConsts = require('../modules/GlobalsConsts');
var SwarmAPI = require('../modules/SwarmAPI');
var sleep = require('sleep');

/**
 * Constants
 */
const DEPLOY_FILEPATH = "/opt/code_controller/deploy";
const DEPLOY_SRD_CONFIG_PATH = "/opt/code_controller/public/srdconfig";

/**
 * Globals
 */
var appStatusMapRef;
var manifestDataRef;
var appPlaybooksPath;
var srdConfigPath;
var appDiscoveryPath;
var appRegistrationPath;
var synapseConfigPath;
var synapseServiceConfigPath;
var nerveConfigPath;
var nerveServiceConfigPath;
var passwordRef;
var installAppPortsRef;

var scaleDataArray;
var containerName;
var imagesForApp;
var imageFullName;

var persistence;
/**
 * Module class definition 
 */
module.exports = function(appStatusMap, manifestData, password, imageName, direction, installAppStatusPorts)
{
  appLogger.info("AppScaler.enter, direction = " + direction);

  appStatusMapRef = appStatusMap;
  manifestDataRef = manifestData;
  passwordRef = password;
  installAppPortsRef = installAppStatusPorts;

  var swarmAPI = new SwarmAPI(manifestData);

  /**
   * Pre-process to create the folder structure for ansible playbook and docker compose files
   */
  this.preProcess = function()
  {
    appLogger.info("AppScaler.preProcess.enter");

    appId = manifestDataRef.manifest.app.id;
    appVersion = manifestDataRef.manifest.app.version;

    //set initial deploy status in app status map
    var appStatus = {type: GlobalsConsts.TASK_TYPE_DEPLOY,
                     started: new Date().toISOString(),
                     stateCode: GlobalsConsts.APP_STATE_START_SCALE,
                     resultCode: GlobalsConsts.RESULT_PENDING,
                     lastChange: new Date().toISOString()};

    appStatusMapRef[appId + ":" + appVersion] = appStatus;

    appLogger.info("AppScaler.preProcess, setting initial appStatus=" +
                   JSON.stringify(appStatus));
    persistence = new Persistence(appId, appVersion, JSON.stringify({}),JSON.stringify(appStatus));
    persistence.setAppdeploystatusDB(function (message) {
      appLogger.info('setAppdeploystatusDB operation = ' + message);
    });

    appPlaybooksRootPath = DEPLOY_FILEPATH + "/" + appId + "/" + appVersion;
    appPlaybooksPath = appPlaybooksRootPath + "/playbooks";
   
    srdConfigPath = DEPLOY_SRD_CONFIG_PATH + "/" + appId + "/" + appVersion;

    commonNervePath = DEPLOY_FILEPATH + "/nerve";
        
    appDiscoveryPath = srdConfigPath + "/synapse";
    appRegistrationPath = DEPLOY_SRD_CONFIG_PATH + "/nerve";

    synapseConfigPath = appDiscoveryPath + "/config";
    synapseServiceConfigPath = synapseConfigPath + "/services";

    nerveConfigPath = appRegistrationPath + "/config";
    nerveServiceConfigPath = nerveConfigPath + "/services";

    appLogger.info("AppScaler.preProcess, appPlaybooksRootPath=" + appPlaybooksRootPath +
              ", appPlaybooksPath=" + appPlaybooksPath);

    appLogger.info("AppScaler.preProcess.exit");
  }


      /**
       * Get the container version by imageName
       */
      this.getContainerVersionByName = function(imageName)
      {
        appLogger.info("AppScaler.getContainerVersionByName.enter");

        var containerVersion = null;
        var containers = manifestDataRef.manifest.app.containers;
        for (var i = 0; i < containers.length; i ++)
        {
          if (containers[i].imageName == imageName)
          {
            containerVersion = containers[i].version;
            break;
          }
        }

        if (!containerVersion)
        {
          appLogger.info("AppScaler.getContainerVersionByName, unable to find the container version by imageName: " + imageName);
          throw GlobalsConsts.RESULT_GEN_COMPOSE_FILE_ERROR;
        }

        appLogger.info("AppScaler.getContainerVersionByName.exit, containerVersion =" + containerVersion);
        return containerVersion;
      }

  /**
   * Class main in a go
   */
  this.go = function() 
  {
    appLogger.info("AppScaler.go.enter");

    appId = manifestDataRef.manifest.app.id;
    appVersion = manifestDataRef.manifest.app.version;

    containerName =  imageName.slice(imageName.lastIndexOf('/') + 1);

    appLogger.info("AppScaler.go imageName = " + imageName);
    appLogger.info("AppScaler.go containerName = " + containerName);

    imageFullName = "dockerrepo:5000/" + imageName + ":" + this.getContainerVersionByName(imageName);
    appLogger.info("AppScaler.go imageFullName = " + imageFullName);

    imagesForApp =[];
    imagesForApp.push(imageFullName);

    appStatusMapRef[appId + ":" + appVersion].stateCode = GlobalsConsts.APP_STATE_START_DEPLOY;
    appStatusMapRef[appId + ":" + appVersion].lastChange = new Date().toISOString();
    persistence = new Persistence(appId, appVersion, JSON.stringify({}),JSON.stringify(appStatusMapRef[appId + ":" + appVersion]));
    persistence.setAppdeploystatusDB(function (message) {
      appLogger.info('setAppdeploystatusDB operation = ' + message);
    });

    appLogger.info("AppScaler.go, changing appStatus to: appStatus=" +
        JSON.stringify(appStatusMapRef[appId + ":" + appVersion]));


    this.getScaleLevel(function (err, scaleDataArray)
    {
      if(scaleDataArray)
      {
        var playbookData = {hostPorts: null, scaleData: scaleDataArray};
        var playbookGenerator = new PlaybookGenerator(appStatusMapRef, manifestDataRef, appPlaybooksPath,
                                                                             passwordRef, playbookData, installAppPortsRef);
        playbookGenerator.genDeployPlaybook();
        playbookGenerator.runDeploy();

        appStatusMapRef[appId + ":" + appVersion].stateCode = GlobalsConsts.RUN_PLAYBOOK;
        appStatusMapRef[appId + ":" + appVersion].lastChange = new Date().toISOString();
        appLogger.info("AppScaler.go, changing appStatus to: appStatus=" +
            JSON.stringify(appStatusMapRef[appId + ":" + appVersion]));
        persistence = new Persistence(appId, appVersion, JSON.stringify({}),JSON.stringify(appStatusMapRef[appId + ":" + appVersion]));
        persistence.setAppdeploystatusDB(function (message) {
          appLogger.info('setAppdeploystatusDB operation = ' + message);
        });

        checkSwarmDeployedStatus(function (err, imageDeployedMap)
        {
           if (err)
           {
             appLogger.info("AppScaler.checkSwarmDeployedStatus, failed to get swarm info");
             appStatusMapRef[appId + ":" + appVersion].stateCode = GlobalsConsts.APP_STATE_RUN_SCALE_PLAYBOOK;
             appStatusMapRef[appId + ":" + appVersion].resultCode = GlobalsConsts.RESULT_SCALE_ERROR;
             appStatusMapRef[appId + ":" + appVersion].lastChange = new Date().toISOString();
             appLogger.info("AppScaler.go, changing appStatus to: appStatus=" +
                         JSON.stringify(appStatusMapRef[appId + ":" + appVersion]));
             persistence = new Persistence(appId, appVersion, JSON.stringify({}),JSON.stringify(appStatusMapRef[appId + ":" + appVersion]));
             persistence.setAppdeploystatusDB(function (message) {
               appLogger.info('setAppdeploystatusDB operation = ' + message);
             });
             return;
           }

          // var portsMap = getPortMap(imageDeployedMap);
           var portsMap = swarmAPI.getPortMap(imagesForApp, imageDeployedMap);
           var portlist =  [];
           keys = Object.keys(portsMap);
           for (keys in portsMap)
           {
             appLogger.info("Key: " + keys + ", Value: " + portsMap[keys]);
             var ports = portsMap[keys]
             for(var j in ports)
             {
               portlist.push(ports[j]);
             }
           }
           //appLogger.info("Portlist are = " + portlist + " Ports are  " + ports);
           installAppPortsRef[appId + ":" + appVersion].ports = portlist;
           if (direction == "up" && portlist.length > 0)
           {
              appLogger.info("AppScaler.go, AppScaler generating nerve configuration if needed");
              appLogger.info("Installed App ports are  = " + installAppPortsRef[appId + ":" + appVersion].ports);
              playbookGenerator.genOpenFirewallPlaybook();
              playbookGenerator.runOpenFirewallPlaybook();

              var nerveGenerator = new NerveConfigGenerator(manifestDataRef,  nerveConfigPath);
              var nerveConfigFiles = nerveGenerator.genConfig(portsMap);

              if (nerveConfigFiles.length != 0)
              {
                playbookGenerator.genNervePlaybook();
                playbookGenerator.runNervePlaybook("deploy");
              }
          }
        });
      }
    });
    appLogger.info("AppScaler.go.exit");
  }

  /* get scale level up or down based on current scale level from swarm cluster */

  this.getScaleLevel = function(callback)
  {
    var scaleLevel;
    scaleDataArray = [];
    swarmAPI.getImageDeployedCount(function (err, imageDeployedCount)
    {
      if (err)
      {
        appLogger.info("AppScaler.getScaleLevel, failed to get swarm info");
        appStatusMapRef[appId + ":" + appVersion].resultCode = GlobalsConsts.RESULT_SCALE_ERROR;
        appStatusMapRef[appId + ":" + appVersion].lastChange = new Date().toISOString();
        appLogger.info("AppScaler.getScaleLevel: setting appStatus=" +
                      JSON.stringify(appStatusMapRef[appId + ":" + appVersion]));
        persistence = new Persistence(appId, appVersion, JSON.stringify({}),JSON.stringify(appStatusMapRef[appId + ":" + appVersion]));
        persistence.setAppdeploystatusDB(function (message) {
          appLogger.info('setAppdeploystatusDB operation = ' + message);
        });
        return callback(err, scaleDataArray);
      }

      if (imageDeployedCount[imageFullName])
      {
        if(direction == "up")
        {
          scaleLevel = imageDeployedCount[imageFullName] + 1;
        }
        else
        {
          scaleLevel = imageDeployedCount[imageFullName] - 1;
        }
        appLogger.info("AppScaler.getScaleLevel: scaleLevel  = " + scaleLevel);
        scaleDataArray.push({"containerName": containerName, "scale": scaleLevel});
        return callback(null, scaleDataArray);
      }
      else
      {
        scaleLevel = 0;
        if(direction == "up")
        {
           scaleLevel +=  1;
           appLogger.info("AppScaler.getScaleLevel: scaleLevel = " + scaleLevel);
           scaleDataArray.push({"containerName": containerName, "scale": scaleLevel});
           return callback(null, scaleDataArray);
        }
        else
        {
           scaleLevel -=  1;
           appLogger.error("AppScaler.getScaleLevel: Can not scale down, the image is not deployed");
           appStatusMapRef[appId + ":" + appVersion].resultCode = GlobalsConsts.RESULT_SCALE_ERROR;
           appStatusMapRef[appId + ":" + appVersion].lastChange = new Date().toISOString();
           appLogger.info("AppScaler.getScaleLevel: setting appStatus=" +
                                 JSON.stringify(appStatusMapRef[appId + ":" + appVersion]));
           persistence = new Persistence(appId, appVersion, JSON.stringify({}),JSON.stringify(appStatusMapRef[appId + ":" + appVersion]));
           persistence.setAppdeploystatusDB(function (message) {
             appLogger.info('setAppdeploystatusDB operation = ' + message);
           });
           return callback("Can not scale down, the image is not deployed", null);
        }
      }
    });
  }

      /**
     * Get the container version by imageName
     */
    this.getContainerVersionByName = function(imageName)
    {
      appLogger.info("AppScaler.getContainerVersionByName.enter");

      var containerVersion = null;
      var containers = manifestDataRef.manifest.app.containers;
      for (var i = 0; i < containers.length; i ++)
      {
        if (containers[i].imageName == imageName)
        {
          containerVersion = containers[i].version;
          break;
        }
      }

      if (!containerVersion)
      {
        appLogger.error("AppScaler.getContainerVersionByName, unable to find the container version by imageName: " + imageName);
        throw GlobalsConsts.RESULT_GEN_COMPOSE_FILE_ERROR;
      }

      appLogger.info("AppScaler.getContainerVersionByName.exit, containerVersion =" + containerVersion);
      return containerVersion;
    }

  checkSwarmDeployedStatus = function(callback)
  {
    appLogger.info("AppScaler.checkSwarmDeployedStatus.enter");

    var scaleExpected = scaleDataArray[0].scale;
    appLogger.info("scaleExpected = " + scaleExpected);
    const MAX_RETRY = 60;
    var retry = 1;
    var last_retry = MAX_RETRY;

    var imageDeployedMapRef = {};
    var timeout = 0;
    (function loop() {
      if (retry < last_retry) {
        swarmAPI.getDeployedImageMap(imagesForApp, function (err, imageDeployedMap)
      	  {
      	    if (err)
      	    {
      	      appLogger.error("Return error from checkSwarmDeployedStatus, err= " + err);

      	      appStatusMapRef[appId + ":" + appVersion].resultCode = GlobalsConsts.RESULT_SCALE_ERROR;
              appStatusMapRef[appId + ":" + appVersion].lastChange = new Date().toISOString();
              appLogger.info("AppScaler.checkSwarmDeployedStatus: setting appStatus=" +
                    JSON.stringify(appStatusMapRef[appId + ":" + appVersion]));
              persistence = new Persistence(appId, appVersion, JSON.stringify({}),JSON.stringify(appStatusMapRef[appId + ":" + appVersion]));
              persistence.setAppdeploystatusDB(function (message) {
                appLogger.info('setAppdeploystatusDB operation = ' + message);
              });

      	      return callback(err, imageDeployedMap);
      	    }
      	    for (var i in imageDeployedMap)
      	    {
              appLogger.info("** Key: " + i + ", *** Value: " + imageDeployedMap[i]);
            }
            imageDeployedMapRef = imageDeployedMap;
      	    if (!imageDeployedMap[imageFullName])
      	    {
      	      appLogger.info("No image for " + imageFullName + " is deployed");
      	      if (scaleExpected == 0)
      	      {
      	        appLogger.info("Now match with the expected scale level = " + scaleExpected);
      	        appLogger.info("DONE retry = " + retry);
                return callback(null, imageDeployedMap);
      	      }
      	      else
      	      {
      	        appLogger.info("Do not match with the expected scale level yet = " + scaleExpected);
      	        appLogger.info("Continue retry = " + retry);
      	        retry ++;
                sleep.sleep(5);
                loop();
      	      }

      	    }
      	    else if(imageDeployedMap[imageFullName].length == scaleExpected)
      	    {
      	      appLogger.info("Deployed image count = " + imageDeployedMap[imageFullName].length + ", which match with the expected scale level = " + scaleExpected);
      	      appLogger.info("DONE retry = " + retry);
      	      return callback(null, imageDeployedMap);
      	    }
      	    else
      	    {
      	      appLogger.info("Deployed image count = " + imageDeployedMap[imageFullName].length + ", DO not match with the expected scale level yet = " + scaleExpected);
      	      appLogger.info("Continue retry = " + retry);
      	      retry ++;
              sleep.sleep(5);
              loop();
      	    }
      	  });

        }
      else
        {
           var errString = "Reach the maximum retry = " + retry + " Deployed image count = " + imageDeployedMapRef[imageFullName].length + ", DO NOT match with scale level = " + scaleExpected;
           appLogger.error(errString);
           appStatusMapRef[appId + ":" + appVersion].stateCode = GlobalsConsts.APP_STATE_RUN_SCALE_PLAYBOOK;
           appStatusMapRef[appId + ":" + appVersion].resultCode = GlobalsConsts.RESULT_SCALE_ERROR;
           appStatusMapRef[appId + ":" + appVersion].lastChange = new Date().toISOString();
           appLogger.info("AppScaler.checkSwarmDeployedStatus: setting appStatus=" +
                                          JSON.stringify(appStatusMapRef[appId + ":" + appVersion]));
           persistence = new Persistence(appId, appVersion, JSON.stringify({}),JSON.stringify(appStatusMapRef[appId + ":" + appVersion]));
           persistence.setAppdeploystatusDB(function (message) {
             appLogger.info('setAppdeploystatusDB operation = ' + message);
           });

           return callback(errString, imageDeployedMapRef);
        }
      }
      ());
      return callback(null, imageDeployedMapRef);
    }
}
