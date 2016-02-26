/**
 * Copyright 2015 ARRIS Enterprises, Inc. All rights reserved.
 * This program is confidential and proprietary to ARRIS Enterprises, Inc. (ARRIS),
 * and may not be copied, reproduced, modified, disclosed to others, published or used,
 * in whole or in part, without the express prior written permission of ARRIS.
 */

/**
 * This module uninstalls the application and removed the docker images from dockerrepo registry
 */

/**
 * Import modules
 */
var appLogger = require('../utils/app_logger');
var DockerAPI = require('../modules/DockerAPI');
var Persistence = require('../modules/Persistence');
var GlobalsConsts = require('../modules/GlobalsConsts');
//var PlaybookGenerator = require('../modules/PlaybookGenerator');

var fs = require('fs');
var fse = require('fs-extra');
var glob = require('glob');

/**
 * Constants
 */
const RELEASE_FILEPATH = "/opt/code_controller/releases"; 
const DEPLOY_FILEPATH = "/opt/code_controller/deploy";

/**
 * Globals
 */
var releaseFileUnzipPath;
var manifestFileName;
var manifestDataMapRef;
var appStatusMapRef;
var manifestData;
var unInstallInProgressRef;

var persistence;

/**
 * Module class definition 
 */
module.exports = function(manifestData, appStatusMap, unInstallInProgress) 
{
  appLogger.info("AppUnInstaller.enter");

  manifestDataMapRef = manifestData;
  appStatusMapRef = appStatusMap;
  unInstallInProgressRef = unInstallInProgress; 
  
  /**
   * Class main in a go
   */ 
  
  this.go = function() 
  {
    appLogger.info("AppUnInstaller.go.enter");
    
    var appId = manifestData.manifest.app.id;
    var appVersion = manifestData.manifest.app.version;
    
    appLogger.info("AppUnInstaller.go, appId= " + appId + " appVersion= " + appVersion);
    
    releaseFileUnzipPath = RELEASE_FILEPATH + "/" + appId + "/" + appVersion;
    appPlaybooksRootPath = DEPLOY_FILEPATH + "/" + appId + "/" + appVersion;
           
    appLogger.info("AppUnInstaller.go, releaseFile PATH= " + releaseFileUnzipPath);
    
   //set initial status in app status map
   var appStatus = {type: GlobalsConsts.TASK_TYPE_UNINSTALL,
                     started: new Date().toISOString(),
                     stateCode: GlobalsConsts.APP_STATE_START_UNINSTALL, 
                     resultCode: GlobalsConsts.RESULT_PENDING, 
                     lastChange: new Date().toISOString()};

    appStatusMapRef[appId + ":" + appVersion] = appStatus;

    appLogger.info("AppUnInstaller.go, setting initial appStatus=" + JSON.stringify(appStatus));
    
    appStatusMapRef[appId + ":" + appVersion].stateCode = GlobalsConsts.APP_STATE_PROCESS_RELEASEFILE,
    appStatusMapRef[appId + ":" + appVersion].lastChange = new Date().toISOString();

    persistence = new Persistence(appId, appVersion, JSON.stringify(appStatus));
    persistence.setAppinstallstatusDB(function (message) {
      appLogger.info('setAppinstallstatusDB operation = ' + message);
    });
    
    try
    {
      fse.removeSync(releaseFileUnzipPath);
    }
    catch (err)
    {
      appLogger.error("AppUnInstaller.go, error removing releaseFileUnzipPath=" + releaseFileUnzipPath);   

      appStatusMapRef[appId + ":" + appVersion].resultCode = GlobalsConsts.RESULT_FILE_REMOVE_ERROR,
	  appStatusMapRef[appId + ":" + appVersion].lastChange = new Date().toISOString();
      persistence = new Persistence(appId, appVersion, JSON.stringify(appStatusMapRef[appId + ":" + appVersion]));
      persistence.setAppinstallstatusDB(function (message) {
        appLogger.info('setAppinstallstatusDB operation = ' + message);
      });
    }
    finally 
    {
      appLogger.info("AppUnInstaller.go removed releaseFiles " + releaseFileUnzipPath);
    }
        
    var playbooks = appPlaybooksRootPath + "/playbooks/*.*";
    appLogger.info("AppUnInstaller.go removing playbooks " + playbooks);
    
    glob(playbooks, function(err, files) {
  	    files.forEach(function(file) {
	    	fs.unlink(file, function(err){
               if (err) throw err;
               appLogger.info(file + " deleted in AppUninstaller");               
          });
	    });
    });

    
 //   var playbookGenerator = new PlaybookGenerator(appStatusMapRef, manifestDataRef, appPlaybooksPath,
    									passwordRef, playbookData, installAppPortsRef);
    
 //   appLogger.info("AppUnInstaller.go generating playbooks  for remove image" + playbooks);
    //deploy application first
 //   playbookGenerator.genRemoveImagesPlaybook();
 //   playbookGenerator.runRemoveImages();
    
   // this.removeImages();

    appLogger.info("AppUnInstaller.go update Status ");
    
    appStatusMapRef[appId + ":" + appVersion].stateCode = GlobalsConsts.APP_STATE_COMPLETE_UNINSTALL,
    appStatusMapRef[appId + ":" + appVersion].resultCode = GlobalsConsts.RESULT_OK,
    appStatusMapRef[appId + ":" + appVersion].lastChange = new Date().toISOString();
    appLogger.info("AppUnInstaller.go removed playbooks " + appPlaybooksRootPath);
    
    persistence= new Persistence(appId, appVersion, JSON.stringify(appStatusMapRef[appId + ":" + appVersion]));
    persistence.setAppinstallstatusDB(function (message) {
      appLogger.info('setAppinstallstatusDB operation = ' + message);
    });
    
   appLogger.info("AppUnInstaller.go: setting appStatus=" + JSON.stringify(appStatusMapRef[appId + ":" + appVersion]));   
   unInstallInProgressRef = false;
   
   appLogger.info("AppUnInstaller.go.exit");
  }

  this.removeImages = function()
  {
     appLogger.info("AppUnInstaller.removeImages.enter");
     var dockerAPI = new DockerAPI(manifestDataMapRef, appStatusMapRef, unInstallInProgressRef);
     dockerAPI.removeImages();
     appLogger.info("AppUnInstaller.removeImages.exit");

  }

}
