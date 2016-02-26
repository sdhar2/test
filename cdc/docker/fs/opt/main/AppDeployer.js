/**
 * Copyright 2015 ARRIS Enterprises, Inc. All rights reserved.
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
var ComposeGenerator = require('../modules/ComposeGenerator');
var PlaybookGenerator = require('../modules/PlaybookGenerator');
var SynapseConfigGenerator = require('../modules/SynapseConfigGenerator');
var NerveConfigGenerator = require('../modules/NerveConfigGenerator');
var AppInstallError = require('../modules/AppInstallError');
var Persistence = require('../modules/Persistence');
var GlobalsConsts = require('../modules/GlobalsConsts');
var SwarmAPI = require('../modules/SwarmAPI');
var fs = require('fs');
var mkdirp = require("mkdirp");
var rimraf = require('rimraf');
var sleep = require('sleep');

var Docker = require('dockerode');
var execSync = require('exec-sync');
var docker = new Docker({protocol: 'http', host: 'swarmcluster', port: 2377});

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
var resourceIdRef;
var scaleIdRef;
var installAppPortsRef;

var persistence;
var imagesForApp;

var ansibleLogFile;
/**
 * Module class definition 
 */
module.exports = function(appStatusMap, manifestData, password, resourceId, scaleId, installAppStatusPorts)
{
  appLogger.info("AppDeployer.enter, resourceId=" + resourceId + ", scaleId=" + scaleId);

  appStatusMapRef = appStatusMap;
  manifestDataRef = manifestData;
  passwordRef = password;
  resourceIdRef = resourceId;
  scaleIdRef = scaleId;
  installAppPortsRef = installAppStatusPorts;

  var swarmAPI = new SwarmAPI(manifestData);

  /**
   * Pre-process to create the folder structure for ansible playbook and docker compose files
   */
  this.preProcess = function()
  {
    appLogger.info("AppDeployer.preProcess.enter");

    appId = manifestDataRef.manifest.app.id;
    appVersion = manifestDataRef.manifest.app.version;

    //set initial deploy status in app status map
    var appStatus = {type: GlobalsConsts.TASK_TYPE_DEPLOY,
                     started: new Date().toISOString(),
                     stateCode: GlobalsConsts.APP_STATE_START_DEPLOY,
                     resultCode: GlobalsConsts.RESULT_PENDING,
                     lastChange: new Date().toISOString()};

    appStatusMapRef[appId + ":" + appVersion] = appStatus;

    appLogger.info("AppDeployer.preProcess, setting initial appStatus=" +
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

    ansibleLogFile  = appPlaybooksPath + "/" + appId + "-ansible.log";

    appLogger.info("AppDeployer.preProcess, appPlaybooksRootPath=" + appPlaybooksRootPath +
              ", appPlaybooksPath=" + appPlaybooksPath ); 

    try
    {
      var fsStats = fs.statSync(appPlaybooksRootPath);
      if (fsStats.isDirectory())
      {
        appLogger.info("AppDeployer.preProcess, appPlaybooksRootPath=" + appPlaybooksRootPath +
                     " exists, removing and re-creating");
     //   rimraf.sync(appPlaybooksRootPath);

        mkdirp.sync(appPlaybooksRootPath);
        mkdirp.sync(appPlaybooksPath);
        mkdirp.sync(srdConfigPath);
        mkdirp.sync(appDiscoveryPath);
        mkdirp.sync(appRegistrationPath);
        mkdirp.sync(synapseConfigPath);
        mkdirp.sync(synapseServiceConfigPath);
        mkdirp.sync(nerveConfigPath);
        mkdirp.sync(nerveServiceConfigPath);
        mkdirp.sync(commonNervePath);
      }
    }
    catch (err)
    {
      appLogger.info("AppDeployer.preProcess, appPlaybooksRootPath=" + appPlaybooksRootPath +
                     " does not exist, creating");
      mkdirp.sync(appPlaybooksRootPath);
      mkdirp.sync(appPlaybooksPath);
      mkdirp.sync(srdConfigPath);
      mkdirp.sync(appDiscoveryPath);
      mkdirp.sync(appRegistrationPath);
      mkdirp.sync(synapseConfigPath);
      mkdirp.sync(synapseServiceConfigPath);
      mkdirp.sync(nerveConfigPath);
      mkdirp.sync(nerveServiceConfigPath);
      mkdirp.sync(commonNervePath);
    }

    // delete the ansible log file if exist
    fs.exists(ansibleLogFile, function(exists) {
      if(exists) {
        appLogger.info("Ansible log file exists. Deleting now ...");
        fs.unlink(ansibleLogFile);
      } else {
        appLogger.info("Ansible log file does not exist.");
      }
    });

    appLogger.info("AppDeployer.preProcess.exit");
  }

  /**
   * Validate resourceId and scaleId
   */
  this.validateResourceAndScaleIds = function()
  {
    appLogger.info("AppDeployer.validateResourceAndScaleIds.enter");

    var result = false;
    var resourceIdMatch = false;
    var scaleIdMatch = false;
    var containers = manifestDataRef.manifest.app.containers;
    if (containers && (containers.length > 0))
    {
      //match with the first container, if no match, signal error
      var resources = containers[0].resources;
      if (resources)
      {
        for (var i = 0; i < resources.length; i ++)
        {
          if (resources[i].level == resourceIdRef)
          {
            resourceIdMatch = true;
            break;
          }
        }
      }

      var scales = containers[0].scale;
      if (scales)
      {
        for (var i = 0; i < scales.length; i ++)
        {
          if (scales[i].level == scaleIdRef)
          {
            scaleIdMatch = true;
            break;
          }
        }
      }
    }

    if (resourceIdMatch && scaleIdMatch)
    {
      result = true;
    }

    appLogger.info("AppDeployer.validateResourceAndScaleIds.exit");
    return result;
  }

 
  this.onlyUnique = function(value, index, self)
  {
	  return self.indexOf(value) === index;
  }
  
  /**
   * Class main in a go
   */
  this.go = function() 
  {
    appLogger.info("AppDeployer.go.enter");

    appId = manifestDataRef.manifest.app.id;
    appVersion = manifestDataRef.manifest.app.version;

    imagesForApp =[];
    var containers = manifestDataRef.manifest.app.containers;
    for (var i in containers)
    {
       var image = containers[i];
       imagesForApp.push("dockerrepo:5000/" + image.imageName + ":" + image.version);
       appLogger.info("imagesForApp = " + imagesForApp);
    }

    appStatusMapRef[appId + ":" + appVersion].stateCode = GlobalsConsts.APP_STATE_GEN_PLAYBOOK,
    appStatusMapRef[appId + ":" + appVersion].lastChange = new Date().toISOString();

    appLogger.info("AppDeployer.go, changing appStatus to: appStatus=" +
        JSON.stringify(appStatusMapRef[appId + ":" + appVersion]));
    persistence = new Persistence(appId, appVersion, JSON.stringify({}),JSON.stringify(appStatusMapRef[appId + ":" + appVersion]));
    persistence.setAppdeploystatusDB(function (message) {
      appLogger.info('setAppdeploystatusDB operation = ' + message);
    });

     // check swarm cluster is formed before deploy application
    swarmAPI.getSwarmNodeIPs(function onCompleted(err, isSwarmClusterFormed) {

      if (err)
      {
        appLogger.error("AppDeployer.go, failed to get swarm node IPs from swarm API");
        appStatusMapRef[appId + ":" + appVersion].resultCode = GlobalsConsts.RESULT_SWARM_INFO_ERROR,
        appStatusMapRef[appId + ":" + appVersion].lastChange = new Date().toISOString();
        appLogger.info("AppDeployer.go: setting appStatus=" +
          JSON.stringify(appStatusMapRef[appId + ":" + appVersion]));
        persistence = new Persistence(appId, appVersion, JSON.stringify({}),JSON.stringify(appStatusMapRef[appId + ":" + appVersion]));
        persistence.setAppdeploystatusDB(function (message) {
          appLogger.info('setAppdeploystatusDB operation = ' + message);
        });
      }

      appLogger.info("AppDeployer.go, get isSwarmClusterFormed = " + isSwarmClusterFormed);

      if (isSwarmClusterFormed)
      {

        // generate synapse configuration if needed based on manifest file
        appLogger.info("AppDeployer.go, AppDeployer generating synapse configuration if needed");
        var synapseGenerator = new SynapseConfigGenerator(manifestDataRef, synapseConfigPath);
        var synapseConfigFiles = synapseGenerator.genConfig();

        //generate compose file for nerve and app seperately
        var composeGenerator = new ComposeGenerator(manifestDataRef, appPlaybooksPath, resourceIdRef, scaleIdRef, synapseConfigFiles, installAppPortsRef);
        var playbookData = composeGenerator.genCompose();

        var playbookGenerator = new PlaybookGenerator(appStatusMapRef, manifestDataRef, appPlaybooksPath,
                                                                     passwordRef, playbookData, installAppPortsRef);
        //deploy application first
        playbookGenerator.genDeployPlaybook();
        playbookGenerator.runDeploy();

        appStatusMapRef[appId + ":" + appVersion].stateCode = GlobalsConsts.APP_STATE_RUN_PLAYBOOK;
        appStatusMapRef[appId + ":" + appVersion].lastChange = new Date().toISOString();
        persistence = new Persistence(appId, appVersion, JSON.stringify({}),JSON.stringify(appStatusMapRef[appId + ":" + appVersion]));
        persistence.setAppdeploystatusDB(function (message) {
          appLogger.info('setAppdeploystatusDB operation = ' + message);
        });

        checkSwarmDeployedStatus(playbookData, function (err, imageDeployedMap)
        {
           if (err)
           {
             appLogger.error("AppDeployer.checkSwarmDeployedStatus, failed to get all images deployed on swarm cluster");
             appStatusMapRef[appId + ":" + appVersion].resultCode = GlobalsConsts.RESULT_DEPLOY_ERROR;
             appStatusMapRef[appId + ":" + appVersion].lastChange = new Date().toISOString();
             appLogger.info("AppDeployer.go, changing appStatus to: appStatus=" +
                         JSON.stringify(appStatusMapRef[appId + ":" + appVersion]));
             persistence = new Persistence(appId, appVersion, JSON.stringify({}),JSON.stringify(appStatusMapRef[appId + ":" + appVersion]));
             persistence.setAppdeploystatusDB(function (message) {
               appLogger.info('setAppdeploystatusDB operation = ' + message);
             });
             return;
           }
           else
           {
             var portsMap = swarmAPI.getPortMap(imagesForApp, imageDeployedMap);
             if (Object.keys(portsMap).length != 0)
             {
               //generate nerve config based on dynamic ports if needed
               appLogger.info("AppDeployer.go, AppDeployer generating nerve configuration if needed");

               var portlist =  installAppPortsRef[appId + ":" + appVersion].ports;
               keys = Object.keys(portsMap);
               for (keys in portsMap)
               {
            	  var ports = portsMap[keys];
                  appLogger.info("Key: " + keys + ", Value: " + portsMap[keys] + "index= " + portlist.indexOf(ports));
                  
                 for(var j in ports)
              	 {
                	 appLogger.info("Check if Port Exists: " + portlist.indexOf(j));
                  	if(portlist.indexOf(j) < 0)
                  		portlist.push(ports[j]);
              	 }
               }

             //  var ports = portlist.filter(this.onlyUnique);
               appLogger.info("portlist are = " + portlist + "Ports are  " + ports);

               installAppPortsRef[appId + ":" + appVersion].ports = portlist;
               persistence = new Persistence(appId, appVersion, JSON.stringify({}),JSON.stringify({}),JSON.stringify({}),JSON.stringify(installAppPortsRef[appId + ":" + appVersion]));
               persistence.setPortlistDB(function (message) {
                 appLogger.info('setPortlistDB operation = ' + message);
               });

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
           }
        });

        
        appLogger.info("AppDeployer.go, changing appStatus to: appStatus=" +
                                   JSON.stringify(appStatusMapRef[appId + ":" + appVersion]));
        persistence = new Persistence(appId, appVersion, JSON.stringify({}),JSON.stringify(appStatusMapRef[appId + ":" + appVersion]));
        persistence.setAppdeploystatusDB(function (message) {
          appLogger.info('setAppdeploystatusDB operation = ' + message);
        });
      }
      else
      {
        appLogger.error("AppDeployer.go: failed to get docker swarm info");
        appStatusMapRef[appId + ":" + appVersion].resultCode = GlobalsConsts.RESULT_SWARM_INFO_ERROR;
        appStatusMapRef[appId + ":" + appVersion].lastChange = new Date().toISOString();
        appLogger.info("AppDeployer.go: setting appStatus=" +
                                     JSON.stringify(appStatusMapRef[appId + ":" + appVersion]));
        persistence = new Persistence(appId, appVersion, JSON.stringify({}),JSON.stringify(appStatusMapRef[appId + ":" + appVersion]));
        persistence.setAppdeploystatusDB(function (message) {
          appLogger.info('setAppdeploystatusDB operation = ' + message);
        });
      }
      appLogger.info("AppDeployer.go.exit");
    });
  }

  checkSwarmDeployedStatus = function(playbookData, callback)
  {
    appLogger.info("AppDeployer.checkSwarmDeployedStatus.enter");

    var scaleData = playbookData.scaleData;
    var scaleExpected = {};

    if (scaleData && scaleData.length)
    {
      for (var i = 0; i < scaleData.length; i ++)
      {
        var scaleInfo = scaleData[i];
        scaleExpected[scaleInfo.containerName] = scaleInfo.scale;
      }
    }

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
              appStatusMapRef[appId + ":" + appVersion].stateCode = GlobalsConsts.APP_STATE_RUN_PLAYBOOK;
      	      appStatusMapRef[appId + ":" + appVersion].resultCode = GlobalsConsts.RESULT_DEPLOY_ERROR;
              appStatusMapRef[appId + ":" + appVersion].lastChange = new Date().toISOString();
              appLogger.info("AppDeployer.checkSwarmDeployedStatus: setting appStatus=" +
                    JSON.stringify(appStatusMapRef[appId + ":" + appVersion]));
              persistence = new Persistence(appId, appVersion, JSON.stringify({}),JSON.stringify(appStatusMapRef[appId + ":" + appVersion]));
              persistence.setAppdeploystatusDB(function (message) {
                appLogger.info('setAppdeploystatusDB operation = ' + message);
              });

      	      return callback(err, imageDeployedMap);
      	    }

      	    imageDeployedMapRef = imageDeployedMap;
      	    var imageDeployedCount =0;
      	    for (var i in imageDeployedMap)
      	    {
              appLogger.info("** Key: " + i + ", *** Value: " + imageDeployedMap[i]);
              imageDeployedCount += 1;
            }

            if(imageDeployedCount < imagesForApp.length)
            {
               appLogger.info("Not all images are deployed");
               appLogger.info("There are " + imageDeployedCount + " of " + imagesForApp.length + " docker containers are deployed yet");
               appLogger.info("Continue retry = " + retry);

               if(checkAnsibleStatus())
               {
                 retry ++;
                 sleep.sleep(5);
                 loop();
               }

               else
               {
                  var errString = "Playbook execution failed, please check the ansible log file for details, ansible log file =" + ansibleLogFile;
                  appLogger.error(errString);
                  appStatusMapRef[appId + ":" + appVersion].stateCode = GlobalsConsts.APP_STATE_RUN_PLAYBOOK;
                  appStatusMapRef[appId + ":" + appVersion].resultCode = GlobalsConsts.RESULT_DEPLOY_ERROR;
                  appStatusMapRef[appId + ":" + appVersion].lastChange = new Date().toISOString();
                  appLogger.info("AppDeployer.checkSwarmDeployedStatus: setting appStatus=" +
                                               JSON.stringify(appStatusMapRef[appId + ":" + appVersion]));
                  persistence = new Persistence(appId, appVersion, JSON.stringify({}),JSON.stringify(appStatusMapRef[appId + ":" + appVersion]));
                  persistence.setAppdeploystatusDB(function (message) {
                     appLogger.info('setAppdeploystatusDB operation = ' + message);
                  });
                  return callback(errString, imageDeployedMapRef);
               }
            }
            else
            {
              for (var i  in imagesForApp)
              {
                var imageName = imagesForApp[i];
                appLogger.info("imageName = " + imageName);
                var containerName = imageName.slice(imageName.lastIndexOf('/') + 1, imageName.lastIndexOf(':'));
                appLogger.info("containerName = " + containerName);
                appLogger.info("Deployed image count = " + imageDeployedMap[imageName].length);
                if(imageDeployedMap[imageName].length >= scaleExpected[containerName])
                {
                  appLogger.info("Now Deployed image count meet with the expected scale level = " + scaleExpected[containerName]);
                  appLogger.info("DONE retry = " + retry);
                  return callback(null, imageDeployedMap);
                }
                else
                {
                  appLogger.info("Deployed image count = " + imageDeployedMap[imageName].length + " less than the expected scale level yet = " + scaleExpected[containerName]);
                  appLogger.info("Continue retry = " + retry);
                  retry ++;
                  sleep.sleep(5);
                  loop();
                }
              }
            }
      	  });
        }
        else
        {
          var errString = "Reach the maximum retry = " + retry + ", retry later, but deployed image count do not match with scale level";
          appLogger.error(errString);
          appStatusMapRef[appId + ":" + appVersion].stateCode = GlobalsConsts.APP_STATE_RUN_PLAYBOOK;
          appStatusMapRef[appId + ":" + appVersion].resultCode = GlobalsConsts.RESULT_DEPLOY_ERROR;
          appStatusMapRef[appId + ":" + appVersion].lastChange = new Date().toISOString();
          appLogger.info("AppDeployer.checkSwarmDeployedStatus: setting appStatus=" +
                                JSON.stringify(appStatusMapRef[appId + ":" + appVersion]));
          persistence = new Persistence(appId, appVersion, JSON.stringify({}),JSON.stringify(appStatusMapRef[appId + ":" + appVersion]));
          persistence.setAppdeploystatusDB(function (message) {
            appLogger.info('setAppdeploystatusDB operation = ' + message);
          });
          return callback(errString, imageDeployedMapRef);
        }

      }());
      return callback(null, imageDeployedMapRef);
    }

    checkAnsibleStatus = function()
    {
       appLogger.info("checkAnsiblelog.enter");
       var status = true;

       try
       {
         var command = "cat " + ansibleLogFile + " | grep failed=1 ";
         content = execSync(command);

         if (content)
         {
            appLogger.error("Playbook ansible status result is failed=1");
            status = false;
         }
         else
         {
            appLogger.info("Playbook ansible status result is failed=0");
         }
       }

       catch (err)
       {
            appLogger.error("playbook result is bad");
            status = false;
       }

       finally
       {
          appLogger.info("checkAnsiblelog.exit");
          return status;
       }
    }
}
