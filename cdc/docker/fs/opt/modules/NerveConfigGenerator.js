/**
 * Copyright 2015 ARRIS Enterprises, Inc. All rights reserved.
 * This program is confidential and proprietary to ARRIS Enterprises, Inc. (ARRIS),
 * and may not be copied, reproduced, modified, disclosed to others, published or used,
 * in whole or in part, without the express prior written permission of ARRIS.
 */

/**
 * This module generate the Docker NerveConfig file based on manifest info 
 */

/**
 * Import modules
 */
var appLogger = require('../utils/app_logger');
var AppInstallError = require('../modules/AppInstallError');
var GlobalsConsts = require('../modules/GlobalsConsts');
var fs = require('fs');
var execSync = require('exec-sync');

/**
 * Globals
 */
var manifestDataRef;
var nerveConfigPathRef;
/**
 * Module class definition
 */
module.exports = function(manifestData, nerveConfigPath) 
{
  appLogger.info("NerveConfigGenerator.enter, nerveConfigPath=" + nerveConfigPath);
  manifestDataRef = manifestData;
  nerveConfigPathRef = nerveConfigPath;
  var appId = manifestDataRef.manifest.app.id;
  var registrationNeeded = false;
  var NerveConfigFileListName = nerveConfigPathRef + "/services/" + "serviceConfigFiles.json";

  this.genConfig = function(portsMap)
  {
  	appLogger.info("NerveConfigGenerator.genConfig.enter");

    var nerveConfigFiles = [];
    var containers = manifestData.manifest.app.containers;

    for(var index in containers) {
      var image = containers[index];

      var registrations = image.registration;
      if (registrations && registrations.length > 0)
      {
         registrationNeeded = true;
         for (var j = 0; j < registrations.length; j ++)
         {
           var registrationInfo = registrations[j];
           appLogger.info("healthCheckUrl: " + registrationInfo.healthCheckUrl + ", serviceName: " + registrationInfo.serviceName + ", servicePort: " + registrationInfo.servicePort);
           this.genNerveConfig(registrationInfo, nerveConfigFiles, portsMap);
         }
      }
    }

    if(registrationNeeded)
    {
        this.buildMainConfigFile();
    }
    else
    {
      appLogger.info("No additional service needs to be registered.");
    }
    return nerveConfigFiles;
  };


  /**
   * Generate the NerveConfig file
   */
  this.buildMainConfigFile = function()
  {
    appLogger.info("NerveConfigGenerator.buildMainConfigFile.enter");
    var nerveServiceConfigDir = nerveConfigPathRef + "/services"
    var mainNerveConfigFileName = nerveConfigPathRef + "/nerve.conf.json";
    var mainConfigFileContent =  "" +
            "{ \r\n" +
    		"  \"instance_id\":\"ARRS_NERVE\", \r\n" +
    		"  \"service_conf_dir\": " + "/opt/nerve/config/nerve_services"  + " \r\n" +
    		"} \r\n";

    appLogger.info("NerveConfigGenerator.genNerveConfig mainConfigFileContent=" + mainConfigFileContent);
    try
      {
        fs.writeFileSync(mainNerveConfigFileName, mainConfigFileContent);
      }
      catch (err)
      {
        appLogger.error("NerveConfigGenerator.buildMainConfigFile, error writing docker NerveConfig file, err=" + err);
        throw GlobalsConsts.RESULT_GEN_NERVE_CONFIG_ERROR;
      }
      finally
      {
        appLogger.info("NerveConfigGenerator.buildMainConfigFile.exit");
      }
  }

    /**
     * Generate the NerveConfig file
     */
    this.getHostIPs = function()
    {
      appLogger.info("NerveConfigGenerator.getHostIPs.enter");
      try
      {
        var command = "cat /opt/code_controller/deploy/resources | egrep -o '([0-9]{1,3}\.){3}[0-9]{1,3}'";
        content = execSync(command);

        var hostIPs = content.split("\n");
        appLogger.info("NerveConfigGenerator.getHostIPs, Host file from inventory is:\r\n" + hostIPs);
        return hostIPs;
      }
      catch (err)
      {
        appLogger.error("NerveConfigGenerator.getHostIPs, error opening inventory file=" + this.INVENTORY_FILENAME + ", err=" + err);
        throw GlobalsConsts.RESULT_GEN_NERVE_CONFIG_ERROR;
      }
    }
  /**
   * Generate the NerveConfig file 
   */
  this.genNerveConfig = function(registrationInfo, nerveConfigFiles, portsMap)
  {
    appLogger.info("NerveConfigGenerator.genNerveConfig.enter");

    var service = registrationInfo.serviceName;
    var port = registrationInfo.servicePort;
    var uri = registrationInfo.healthCheckUrl;
    var appId = manifestDataRef.manifest.app.id;
    var appVersion = manifestDataRef.manifest.app.version;
    const ZOOKEEPER_STR = "zookeeperCluster";
    var NerveConfigFileListContent = "";

    var hostIPs = this.getHostIPs();
    for (var j = 0; j < hostIPs.length; j ++)
    {
      var ip = hostIPs[j];
      var publicPortList = portsMap[ip +":" + port];
      if (publicPortList)
      {
        for (var i = 0; i < publicPortList.length; i ++)
        {
          var NerveConfigFileName = nerveConfigPathRef + "/services/" + appId + "_" + appVersion + "_" + service + "_" + publicPortList[i] + ".json";
          var NerveConfigFileContent = "" +
                                  "{ \r\n" +
                                  "  \"host\": \"" + ip  + "\", \r\n" +
                                  "  \"port\":" + publicPortList[i] + ",  \r\n" +
                                  "  \"report_type\":"  + " \"zookeeper\", \r\n" +
                                  "  \"zk_hosts\":[\"" + ZOOKEEPER_STR +  ":2181\"],  \r\n" +
                                  "  \"zk_path\":" + "\"/acp/srd/" + appId + "/" + service + "\",  \r\n" +
                                  "  \"check_interval\": 5, \r\n" +
                                  "  \"checks\":[ \r\n" +
                                  "    { \r\n" +
                                  "    \"type\":"  + " \"http\", \r\n" +
                                  "    \"uri\":"  + "\"" + uri + "\",  \r\n" +
                                  "    \"port\":" + "\"" + publicPortList[i] + "\",  \r\n" +
                                  "    \"timeout\": 1, \r\n" +
                                  "    \"rise\": 2, \r\n" +
                                  "    \"fall\": 10 \r\n" +
                                  "    } \r\n" +
                                  "  ] \r\n" +
                                  "} \r\n";

          nerveConfigFiles.push(appId + "_" + appVersion + "_" + service + "_" + publicPortList[i] + ".json");
          NerveConfigFileListContent += appId + "_" + appVersion + "_" + service + "_" + publicPortList[i] + ".json ";
          appLogger.info("NerveConfigGenerator.genNerveConfig NerveConfigFileListContent=" + NerveConfigFileListContent);
          appLogger.info("NerveConfigGenerator.genNerveConfig NerveConfigFileContent=" + NerveConfigFileContent);

          try
          {
            fs.writeFileSync(NerveConfigFileName, NerveConfigFileContent);
          }
          catch (err)
          {
            appLogger.error("NerveConfigGenerator.genNerveConfig, error writing docker NerveConfig file, err=" + err);
            throw GlobalsConsts.RESULT_GEN_NERVE_CONFIG_ERROR;
          }
          finally
          {
            appLogger.info("NerveConfigGenerator.genNerveConfig.exit");
          }
        }
      }
    }

    try
    {
      fs.writeFileSync(NerveConfigFileListName, NerveConfigFileListContent);
    }
    catch (err)
    {
      appLogger.error("NerveConfigGenerator.genNerveConfig, error writing docker SERVICE_CONFIG_FILES file, err=" + err);
      throw GlobalsConsts.RESULT_GEN_NERVE_CONFIG_ERROR;
    }
  }
}
