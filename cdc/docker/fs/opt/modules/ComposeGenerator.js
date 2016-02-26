/**
 * Copyright 2015 ARRIS Enterprises, Inc. All rights reserved.
 * This program is confidential and proprietary to ARRIS Enterprises, Inc. (ARRIS),
 * and may not be copied, reproduced, modified, disclosed to others, published or used,
 * in whole or in part, without the express prior written permission of ARRIS.
 */

/**
 * This module generate the Docker Compose file based on manifest info 
 */

/**
 * Import modules
 */
var appLogger = require('../utils/app_logger');
var AppInstallError = require('../modules/AppInstallError');
var GlobalsConsts = require('../modules/GlobalsConsts');
var fs = require('fs');
var execSync = require('exec-sync');
var mkdirp = require("mkdirp");
/**
 * Globals
 */
var manifestDataRef;
var appPlaybooksPathRef;
var resourceIdRef;
var scaleIdRef;
var installAppPortsRef;

const DOCKERREPO_STR = "dockerrepo:5000/";
const CDC_URI_PATH = "http://cdcaas:9087/code_controller/srdconfig/";
const SRD_URI_PATH = "http://dockerrepo/service-scripts/srdaas/";
const DEPLOY_FILEPATH = "/opt/code_controller/deploy";
/**
 * Module class definition
 */
module.exports = function(manifestData, appPlaybooksPath, resourceId, scaleId, synapseConfigFiles, installAppPorts)
{
  appLogger.info("ComposeGenerator.enter, appPlaybooksPath=" + appPlaybooksPath + 
                 ", resourceId=" + resourceId + ", scaleId=" + scaleId);
  manifestDataRef = manifestData;
  appPlaybooksPathRef = appPlaybooksPath;
  resourceIdRef = resourceId;
  scaleIdRef = scaleId;
  installAppPortsRef = installAppPorts;

  /**
   * Generate the Compose file 
   */
  this.genCompose = function() 
  {
    appLogger.info("ComposeGenerator.genCompose.enter");
    var regLinkArray = [];
    var discoveryLinkArray = [];
    var playbookData = {hostPorts: null, scaleData: null};
    var scaleDataArray = [];
    var hostPortsArray = [];

   // this.genContainerNames();
    this.genNewContainerNames();

    var appId = manifestDataRef.manifest.app.id;
    var appVersion = manifestDataRef.manifest.app.version;
    var composeFileName = appPlaybooksPathRef + "/" + appId + "-compose.yml";
    
    var commonNervePath = DEPLOY_FILEPATH + "/nerve";
    var commonNerveFileName = commonNervePath + "/" + "nerve-compose.yml";
    
    var composeFileContent = "";
    var nerveComposeFileContent = "";

    //set initial status in app status map
    var portsData = {ports: hostPortsArray};   
    installAppPortsRef[appId + ":" + appVersion] = portsData;
     
    var containers = manifestDataRef.manifest.app.containers;

    for (var i = 0; i < containers.length; i ++)
    {
      if (i > 0)
      {
        composeFileContent += "\r\n";
      }
    
      var containerName = containers[i].containerName;
      
      composeFileContent += containerName + ":\r\n";

      var imageName = containers[i].imageName;
      var imageVersion = containers[i].version;
           
      composeFileContent += " image: " + DOCKERREPO_STR + imageName + ":" + imageVersion + "\r\n";
      composeFileContent += " restart: always \r\n";
      
      var resources = containers[i].resources;
      if (resources && resources.length > 0)
      {
        var memoryLimit = null;
        for (var j = 0; j < resources.length; j ++)
        {
          if (resources[j].level == resourceIdRef)
          {
            memoryLimit = resources[j].memory + "m";
            vcpus = resources[j].vcpus;
            break;
          }
        }     
            
        if (memoryLimit)
        {
          composeFileContent += " mem_limit: " + memoryLimit + "\r\n";
        }

        if (vcpus)
        {
          composeFileContent += " cpu_shares: " + vcpus + "\r\n";
        }
      }
      /* Container log rotation for applications*/
      var logrotation = " log_driver: \"json-file\"\r\n" +
      		" log_opt:\r\n" +
      		"  max-size: \"100m\" \r\n" +
      		"  max-file: \"10\" \r\n";
     
      composeFileContent += logrotation;

      var scale = containers[i].scale;
      if (scale && scale.length > 0)
      {
        for (var j = 0; j < scale.length; j ++)
        {
          if (scale[j].level == scaleIdRef)
          {
            scaleDataArray.push({"containerName": containerName, "scale": scale[j].instances});
            break;
          }
        }    
      }

      var exposedPorts = containers[i].exposedPorts;
      if (exposedPorts && exposedPorts.length > 0)
      {
        composeFileContent += " expose: \r\n";
        for (var j = 0; j < exposedPorts.length; j ++)
        {
          composeFileContent += "  - \"" + exposedPorts[j] + "\"\r\n";
        }
      }


      var registrations =  containers[i].registration;
      if (registrations && registrations.length > 0)
      {
          regLinkArray.push(containerName);
          appLogger.info("ComposeGenerator.genCompose regLinkArray is:\r\n" + regLinkArray);
      }

      var discoverys =  containers[i].discovery;
      if (discoverys && discoverys.length > 0)
      {
          discoveryLinkArray.push(containerName);
          appLogger.info("ComposeGenerator.genCompose discoveryLinkArray is:\r\n" + discoveryLinkArray);
      }

      var publishedPorts = containers[i].publishedPorts;
      if (publishedPorts && publishedPorts.list && publishedPorts.list.length > 0)
      {
        composeFileContent += " ports: \r\n";
        if (registrations && registrations.length > 0)
        {
          for (var j = 0; j < registrations.length; j ++)
          {
            composeFileContent += " - " + "\"" + registrations[j].servicePort + "\"\r\n";
            hostPortsArray.push(registrations[j].servicePort);
          }
        }

        for (var j = 0; j < publishedPorts.list.length; j ++)
        {
          if (publishedPorts.list[j].host)
          {  
            composeFileContent += "  - \"" + publishedPorts.list[j].host + "\"\r\n";
            hostPortsArray.push(publishedPorts.list[j].host);
          }
          else
          {
            composeFileContent += "  - \"" + publishedPorts.list[j].container + "\"\r\n";
            hostPortsArray.push(publishedPorts.list[j].container);
          }
        }
      }

      else
      {
        if (registrations && registrations.length > 0)
        {
          composeFileContent += " ports: \r\n";
          for (var j = 0; j < registrations.length; j ++)
          {
            composeFileContent += "  - " + "\"" + registrations[j].servicePort + "\" \r\n";
            hostPortsArray.push(registrations[j].servicePort);
          }
        }
      }
  
      var envs = containers[i].envVars;
      if (envs && envs.length > 0)
      {
        composeFileContent += " environment: \r\n";
        for (var j = 0; j < envs.length; j ++)
        {
          composeFileContent += "  - " + envs[j].name + "=" + envs[j].value + "\r\n";
        }
      }

      var volumes = containers[i].advertisedDataVolumes;
      if (volumes && volumes.length > 0)
      {
        composeFileContent += " volumes: \r\n"; 
        for (var j = 0; j < volumes.length; j ++)
        {
          composeFileContent += "  - " + volumes[j].volumePath + ":" + volumes[j].permissions + "\r\n";
        }
      }
      
      if (discoverys && discoverys.length > 0)
      {
         composeFileContent += " links: \r\n";
         composeFileContent += "  - " + appId + "-arrs-synapse:arrs-synapse" + "\r\n";
      }

      var volumeFrom = containers[i].dataVolumesRequiredFrom;
      if (volumeFrom && volumeFrom.length > 0)
      {
        composeFileContent += " volumes_from: \r\n";
        for (var j = 0; j < volumeFrom.length; j ++)
        {
          var VFContainerName = this.getContainerNameByImageRef(volumeFrom[j].imageRef);
          composeFileContent += "  - " + VFContainerName + "\r\n";
        }
      }
    } //end for each container

    appLogger.info("ComposeGenerator.genCompose composeFileContent is:\r\n" + composeFileContent);
    var srdaasVersion = this.getSrdaasVersion();
    if (regLinkArray.length > 0)
    {
      appLogger.info("ComposeGenerator.genCompose starting to generate nerve compose file");
      var srdBaseDir = "/opt/code_controller/deploy/srd/";
      var nerveComposeFileDir = srdBaseDir + srdaasVersion + "/nerve/roles/nerve/files";
      var initNerveComposeFileName = nerveComposeFileDir + "/nerve-compose.yml";

      try
      {
        mkdirp.sync(nerveComposeFileDir);
        var command = "curl -s -o " + initNerveComposeFileName + " " + SRD_URI_PATH  + srdaasVersion + "/nerve/roles/nerve/files/nerve-compose.yml";
        content = execSync(command);
        appLogger.info("ComposeGenerator.genCompose got the initial nerve compose file");
      }
      catch (err)
      {
        appLogger.error("ComposeGenerator.genCompose failed to get the initial nerve compose file, err=" + err);
        throw GlobalsConsts.RESULT_FILE_NOT_FOUND;
      }

      try
      {
        fs.statSync(initNerveComposeFileName);
        nerveComposeFileContent = fs.readFileSync(initNerveComposeFileName);
      }
      catch (err)
      {
        throw GlobalsConsts.RESULT_GEN_COMPOSE_FILE_ERROR;
      }

      var nerve_services_path = CDC_URI_PATH + "nerve/config/services/";

      nerveComposeFileContent += "  environment: \r\n";
      nerveComposeFileContent += "  - CONFIG=" + CDC_URI_PATH + "nerve/config/nerve.conf.json \r\n";
      nerveComposeFileContent += "  - SERVICES_URI=" + nerve_services_path + "\r\n";
      nerveComposeFileContent += "  - SERVICES_CONFIG_FILES=serviceConfigFiles.json" + " \r\n";

      appLogger.info("ComposeGenerator.genCompose nerveComposeFileContent is:\r\n" + nerveComposeFileContent);

      try
      {
        fs.writeFileSync(commonNerveFileName, nerveComposeFileContent)
      }
      catch (err)
      {
        appLogger.error("ComposeGenerator.genCompose, error writing the nerve compose file, err=" + err);
        throw GlobalsConsts.RESULT_GEN_COMPOSE_FILE_ERROR;
     }

   }
    if (discoveryLinkArray.length > 0)
    {
      appLogger.info("ComposeGenerator.genCompose starting to generate synapse compose file");

      var srdBaseDir = "/opt/code_controller/deploy/srd/";
      var synapseComposeFileDir = srdBaseDir + srdaasVersion + "/synapse-haproxy/roles/synapse/files";
      var synapseComposeFileName = synapseComposeFileDir + "/synapse-compose.yml";
      var synapseComposeFileContent="";
      try
      {
        mkdirp.sync(synapseComposeFileDir);
        var command = "curl -s -o " + synapseComposeFileName + " " + SRD_URI_PATH + srdaasVersion + "/synapse-haproxy/roles/synapse/files/synapse-compose.yml";
        content = execSync(command);
        appLogger.info("ComposeGenerator.genCompose retrieved the initial synapse compose file");
      }
      catch (err)
      {
        appLogger.error("ComposeGenerator.genCompose failed to retrieve the initial synapse compose file, err=" + err);
        throw GlobalsConsts.RESULT_FILE_NOT_FOUND;
      }

      try
      {
        fs.statSync(synapseComposeFileName);
        synapseComposeFileContent = appId + "-" + fs.readFileSync(synapseComposeFileName);
      }
      catch (err)
      {
        throw GlobalsConsts.RESULT_GEN_COMPOSE_FILE_ERROR;
      }

      var synapse_services_path = CDC_URI_PATH + appId + "/" + appVersion + "/synapse/config/services/";

      synapseComposeFileContent += "  environment: \r\n";
      synapseComposeFileContent += "  - CONFIG=" + CDC_URI_PATH + appId + "/" + appVersion + "/synapse/config/synapse.conf.json \r\n";
      synapseComposeFileContent += "  - SERVICES_URI=" + synapse_services_path + "\r\n";
      synapseComposeFileContent += "  - SERVICES_CONFIG_FILES=" + synapseConfigFiles + " \r\n";

      composeFileContent += "\r\n" + synapseComposeFileContent;
      appLogger.info("ComposeGenerator.genCompose composeFileContent is:\r\n" + composeFileContent);
    }

    try
    {
      fs.writeFileSync(composeFileName, composeFileContent);
      playbookData.hostPorts = hostPortsArray;
      installAppPortsRef[appId + ":" + appVersion].ports = hostPortsArray;
      playbookData.scaleData = scaleDataArray;
      return playbookData;
    }
    catch (err)
    {
      appLogger.error("ComposeGenerator.genCompose, error writing the application compose file, err=" + err);
      throw GlobalsConsts.RESULT_GEN_COMPOSE_FILE_ERROR;
    }
    finally
    {
      appLogger.info("ComposeGenerator.genCompose.exit");
    }
  }

  /**
   * Generate container names and update manifestDataRef
   
  this.genContainerNames = function()
  {
    appLogger.info("ComposeGenerator.genContainerNames.enter");

    var appId = manifestDataRef.manifest.app.id;
    var containers = manifestDataRef.manifest.app.containers;
    for (var i = 0; i < containers.length; i ++)
    {
      var container = containers[i];
      container["containerName"] = appId + "-" + (i + 1);
    }

    appLogger.info("ComposeGenerator.genContainerNames.exit, manifestDataRef=" + JSON.stringify(manifestDataRef));
  }*/
  
  
  /**
   * Generate container names and update manifestDataRef
   */
  this.genNewContainerNames = function()
  {
    appLogger.info("ComposeGenerator.genContainerNames.enter");

    var appId = manifestDataRef.manifest.app.id;
    var containers = manifestDataRef.manifest.app.containers;
    for (var i = 0; i < containers.length; i ++)
    {
      var container = containers[i];
      var imageName = containers[i].imageName;
      container["containerName"] = imageName.slice(imageName.lastIndexOf('/') + 1);
     // container["containerName"] = appId + "-" + (i + 1);
    }

    appLogger.info("ComposeGenerator.genContainerNames.exit, manifestDataRef=" + JSON.stringify(manifestDataRef));     
  }
  
  /**
   * Get the container name by imageRef
   */
  this.getContainerNameByImageRef = function(imageRef)
  {
    appLogger.info("ComposeGenerator.getContainerNameByImageRef.enter");

    var containerName = null;
    var containers = manifestDataRef.manifest.app.containers;
    for (var i = 0; i < containers.length; i ++)
    {
      if (containers[i].imageName == imageRef)
      {
        containerName = containers[i].containerName;
        break;
      }
    }

    if (!containerName)
    {
      appLogger.error("ComposeGenerator.getContainerNameByImageRef, unable to find the container name by imageRef: " + imageRef);
      appLogger.info("ComposeGenerator.getContainerNameByImageRef.exit");
      throw GlobalsConsts.RESULT_GEN_COMPOSE_FILE_ERROR;
    }

    appLogger.info("ComposeGenerator.getContainerNameByImageRef.exit, containerName=" + containerName);
    return containerName;
  }

    /**
     * get srdaas version
     */
    this.getSrdaasVersion = function()
    {
      appLogger.info("ComposeGenerator.getSrdaasVersion.enter");

      try
      {
        mkdirp.sync("/opt/code_controller/deploy/srd/");
        var command = "curl -s -o /opt/code_controller/deploy/srd/srdaas.json http://dockerrepo/service-scripts/srdaas/srdaas.json";
        content = execSync(command);

      }
      catch (err)
      {
        appLogger.error("ComposeGenerator.getSrdaasVersion, err=" + err);
        throw GlobalsConsts.RESULT_FILE_NOT_FOUND;
      }

      var srdBaseDir = "/opt/code_controller/deploy/srd";

      var srdaasJsonFileName = srdBaseDir + "/srdaas.json";

      var srdaasJsonFileContent = "";

      try
      {
        fs.statSync(srdaasJsonFileName);
      }
      catch (err)
      {
        throw GlobalsConsts.RESULT_GEN_COMPOSE_FILE_ERROR;
      }

      try
      {
        srdaasJsonFileContent = fs.readFileSync(srdaasJsonFileName);
        var srdVersionData = JSON.parse(srdaasJsonFileContent);
        appLogger.info("ComposeGenerator.getSrdaasVersion, version is:\r\n" + srdVersionData.srdaasVersion.serviceVersion);
        return srdVersionData.srdaasVersion.serviceVersion;
      }
      catch(err)
      {
        throw GlobalsConsts.RESULT_GEN_COMPOSE_FILE_ERROR;
      }
    }
    
}
