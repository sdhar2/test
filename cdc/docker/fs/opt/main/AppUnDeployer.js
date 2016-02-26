/**
 * Copyright 2015 ARRIS Enterprises, Inc. All rights reserved.
 * This program is confidential and proprietary to ARRIS Enterprises, Inc. (ARRIS),
 * and may not be copied, reproduced, modified, disclosed to others, published or used,
 * in whole or in part, without the express prior written permission of ARRIS.
 */

/**
 * This module generates  ansible playbooks to undeploy the application.
 */

/**
 * Import modules
 */
var appLogger = require('../utils/app_logger');
var PlaybookGenerator = require('../modules/PlaybookGenerator');
var Persistence = require('../modules/Persistence');
var GlobalsConsts = require('../modules/GlobalsConsts');
var fse = require('fs-extra');
var fs = require('fs');
var rimraf = require('rimraf');
var glob = require('glob');
var path = require('path');

var Docker = require('dockerode');
var execSync = require('exec-sync');
var docker = new Docker({protocol: 'http', host: 'swarmcluster', port: 2377});

/**
 * Constants
 */
const DEPLOY_FILEPATH = "/opt/code_controller/deploy";
const DEPLOY_SRD_CONFIG_PATH = __dirname + '/../public/srdconfig';
const NERVE_CONFIG_PATH = "/opt/code_controller/deploy/srdconfig/nerve/config";

/**
 * Globals
 */
var appStatusMapRef;
var manifestDataRef;
var appPlaybooksPath;
var appRolesPath;
var appFilesPath;
var appTasksPath;
var srdConfigPath;
var passwordRef;
var installAppPortsRef;

var persistence;

/**
 * Module class definition 
 */
module.exports = function(appStatusMap, manifestData, password, installAppPorts)
{
  appLogger.info("AppUnDeployer.enter");

  appStatusMapRef = appStatusMap;
  manifestDataRef = manifestData;
  passwordRef = password;
  installAppPortsRef = installAppPorts;
 
  /**
   * Post-process to create the folder structure for ansible playbook and docker compose files
   */
  removeFiles = function()
  {
    appLogger.info("AppUnDeployer.removeFiles.enter");

    appId = manifestDataRef.manifest.app.id;
    appVersion = manifestDataRef.manifest.app.version;
   
    appStatusMapRef[appId + ":" + appVersion].stateCode = GlobalsConsts.PROCESS_RELEASE_FILE,
    appStatusMapRef[appId + ":" + appVersion].lastChange = new Date().toISOString();
    persistence= new Persistence(appId, appVersion, JSON.stringify(appStatusMapRef[appId + ":" + appVersion]));
    persistence.setAppdeploystatusDB(function (message) {
      appLogger.info('setAppdeploystatusDB operation = ' + message);
    });
    
    appLogger.info("AppUnDeployer.removeFiles, removing generated files");

    appPlaybooksRootPath = DEPLOY_FILEPATH + "/" + appId + "/" + appVersion;
    srdConfigPath = DEPLOY_SRD_CONFIG_PATH + "/" + appId + "/" + appVersion;
    nerveConfigFiles = NERVE_CONFIG_PATH + "/services/" + appId + "_" + appVersion + "*.json";
    nerveserviceFiles = NERVE_CONFIG_PATH + "/services/*.json";
    
    appLogger.info("AppUnDeployer.removeFiles srdConfigPath=" + srdConfigPath);
    try
    {
      fse.removeSync(srdConfigPath);    
    }
    catch (err)
    {
      appLogger.info("AppUnDeployer.removeFiles, appPlaybooksRootPath=" + srdConfigPath +
                     " can not delete");    
      appStatusMapRef[appId + ":" + appVersion].resultCode = GlobalsConsts.RESULT_FILE_REMOVE_ERROR,
      appStatusMapRef[appId + ":" + appVersion].lastChange = new Date().toISOString();
      persistence= new Persistence(appId, appVersion, JSON.stringify(appStatusMapRef[appId + ":" + appVersion]));
      persistence.setAppdeploystatusDB(function (message) {
        appLogger.info('setAppdeploystatusDB operation = ' + message);
      });
    }
    finally 
    {
      appLogger.info("AppUnDeployer.removeFiles removed playbooks " + srdConfigPath);
    }
     
    appLogger.info("AppUndeployer:Removing Nerve Config Files in removeFile" +  nerveConfigFiles);
   
    glob(nerveConfigFiles, function(err, files) {
  	    files.forEach(function(file) {
	    	//appLogger.info('Nerve Files to delete in removeFiles: ' + file);
	    	fs.unlink(file, function(err){
               if (err) throw err;
               appLogger.info(file + " deleted in AppUnDeployer.removeFiles");               
          });
	    });
    });
    
    appLogger.info("AppUnDeployer.removeFiles.exit");
    appStatusMapRef[appId + ":" + appVersion].stateCode = GlobalsConsts.APP_STATE_COMPLETE_UNDEPLOY,
    appStatusMapRef[appId + ":" + appVersion].resultCode = GlobalsConsts.RESULT_OK,
    appStatusMapRef[appId + ":" + appVersion].lastChange = new Date().toISOString();
    persistence = new Persistence(appId, appVersion, JSON.stringify({}),JSON.stringify(appStatusMapRef[appId + ":" + appVersion]));
    persistence.setAppdeploystatusDB(function (message) {
      appLogger.info('setAppdeploystatusDB operation = ' + message);
    });
  }

 
  /**
   * Class main in a go
   */
  this.go = function() 
  {
     appLogger.info("AppUnDeployer.go.enter");

     appId = manifestDataRef.manifest.app.id;
     appVersion = manifestDataRef.manifest.app.version;

     appPlaybooksRootPath = DEPLOY_FILEPATH + "/" + appId + "/" + appVersion;
     appPlaybooksPath = appPlaybooksRootPath + "/playbooks";
     appRolesPath = appPlaybooksPath + "/roles";
     appFilesPath = appRolesPath + "/" + appId + "/files";
     
    //set initial deploy status in app status map
     var appStatus = {type: GlobalsConsts.TASK_TYPE_UNDEPLOY,
                      started: new Date().toISOString(),
                      stateCode: GlobalsConsts.APP_STATE_START_UNDEPLOY,
                      resultCode: GlobalsConsts.RESULT_PENDING,
                      lastChange: new Date().toISOString()};

      appStatusMapRef[appId + ":" + appVersion] = appStatus; 
      persistence = new Persistence(appId, appVersion, JSON.stringify({}),JSON.stringify(appStatusMapRef[appId + ":" + appVersion]));
      persistence.setAppdeploystatusDB(function (message) {
        appLogger.info('setAppdeploystatusDB operation = ' + message);
      });

      appLogger.info("AppUnDeployer.go, changing appStatus to: appStatus=" +
        JSON.stringify(appStatusMapRef[appId + ":" + appVersion]));

      docker.info(function onCompleted(err, data) {

      var infoData = JSON.stringify(JSON.parse(JSON.stringify(data)));
      appLogger.info("AppUnDeployer.go, get docker swarm info = " + infoData);

      if (infoData)
      {
        try
        {           
          var playbookData = "";

          var playbookGenerator = new PlaybookGenerator(appStatusMapRef, manifestDataRef, appPlaybooksPath,
                                                                    passwordRef, playbookData, installAppPortsRef);
             
          appStatusMapRef[appId + ":" + appVersion].stateCode = GlobalsConsts.APP_STATE_GEN_PLAYBOOK,
          appStatusMapRef[appId + ":" + appVersion].lastChange = new Date().toISOString();

          appLogger.info("AppUnDeployer.go, changing appStatus to: appStatus=" +
                     JSON.stringify(appStatusMapRef[appId + ":" + appVersion]));
          persistence = new Persistence(appId, appVersion, JSON.stringify({}),JSON.stringify(appStatusMapRef[appId + ":" + appVersion]),JSON.stringify(installAppPortsRef[appId + ":" + appVersion]));
          persistence.setAppdeploystatusDB(function (message) {
            appLogger.info('setAppdeploystatusDB operation = ' + message);
          });
          persistence.setPortlistDB(function (message) {
            appLogger.info('setAppdeploystatusDB operation = ' + message);
          });

          appLogger.info("AppUnDeployer.go,Ports opened =" +
                     JSON.stringify(installAppPortsRef[appId + ":" + appVersion]) + "port = " + installAppPortsRef[appId + ":" + appVersion].ports);
             
          playbookGenerator.genCloseFirewallPlaybook()
          playbookGenerator.genUnDeployPlaybook();
          playbookGenerator.genClenupImagesPlaybook();
          playbookGenerator.genNervePlaybook();

          appStatusMapRef[appId + ":" + appVersion].stateCode = GlobalsConsts.APP_STATE_RUN_UNDEPLOY_PLAYBOOK,
          appStatusMapRef[appId + ":" + appVersion].lastChange = new Date().toISOString();

          appLogger.info("AppUnDeployer.go, changing appStatus to: appStatus=" +
                                   JSON.stringify(appStatusMapRef[appId + ":" + appVersion]));
          persistence = new Persistence(appId, appVersion, JSON.stringify({}),JSON.stringify(appStatusMapRef[appId + ":" + appVersion]));
          persistence.setAppdeploystatusDB(function (message) {
            appLogger.info('setAppdeploystatusDB operation = ' + message);
          });

          playbookGenerator.runUnDeploy();
          playbookGenerator.runNervePlaybook("undeploy");
                       
          appLogger.info("Completed Running UnDeploy Playbook" );
          
          playbookGenerator.genRemoveImagesPlaybook();
          playbookGenerator.runRemoveImages();
          
          appLogger.info("Completed Running Remove Images from dockerRepo" );
          
          removeFiles();
             
          appLogger.info("Completed Running Remove Files" );
        }
        catch (err)
        {
          appLogger.error("AppUnDeployer.go: failed to undeploy, err=" + err);
          appStatusMapRef[appId + ":" + appVersion].resultCode = GlobalsConsts.RESULT_UNDEPLOY_ERROR,
          appStatusMapRef[appId + ":" + appVersion].lastChange = new Date().toISOString();
          appLogger.info("AppUnDeployer.go: setting appStatus=" +
                                                  JSON.stringify(appStatusMapRef[appId + ":" + appVersion]));
          persistence = new Persistence(appId, appVersion, JSON.stringify({}),JSON.stringify(appStatusMapRef[appId + ":" + appVersion]));
          persistence.setAppdeploystatusDB(function (message) {
            appLogger.info('setAppdeploystatusDB operation = ' + message);
          });
        }
      }
      else
      {
        appLogger.error("AppUnDeployer.go: failed to get docker swarm info");
        appStatusMapRef[appId + ":" + appVersion].resultCode = GlobalsConsts.RESULT_SWARM_INFO_ERROR,
        appStatusMapRef[appId + ":" + appVersion].lastChange = new Date().toISOString();
        appLogger.info("AppUnDeployer.go: setting appStatus=" +
                                     JSON.stringify(appStatusMapRef[appId + ":" + appVersion]));
        persistence = new Persistence(appId, appVersion, JSON.stringify({}),JSON.stringify(appStatusMapRef[appId + ":" + appVersion]));
        persistence.setAppdeploystatusDB(function (message) {
          appLogger.info('setAppdeploystatusDB operation = ' + message);
        });
      }
      appLogger.info("AppUnDeployer.go.exit");
    });
  }
}
