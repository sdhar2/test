/**
 * Copyright 2015 ARRIS Enterprises, Inc. All rights reserved.
 * This program is confidential and proprietary to ARRIS Enterprises, Inc. (ARRIS),
 * and may not be copied, reproduced, modified, disclosed to others, published or used,
 * in whole or in part, without the express prior written permission of ARRIS.
 */

/**
 * This module generate the Docker synapseConfig file based on manifest info 
 */

/**
 * Import modules
 */
var appLogger = require('../utils/app_logger');
var AppInstallError = require('../modules/AppInstallError');
var GlobalsConsts = require('../modules/GlobalsConsts');
var fs = require('fs');

/**
 * Globals
 */
var manifestDataRef;
var synapseConfigPathRef;


/**
 * Module class definition
 */
module.exports = function(manifestData, synapseConfigPath) 
{
  appLogger.info("SynapseConfigGenerator.enter, synapseConfigPath=" + synapseConfigPath);
  manifestDataRef = manifestData;
  synapseConfigPathRef = synapseConfigPath;
  var discoveryNeeded = false;

  this.genConfig = function()
  {
  	appLogger.info("SynapseConfigGenerator.genConfig.enter");

  	var synpaseConfigFiles = [];

    var containers = manifestData.manifest.app.containers;

     for(var index in containers) {
       var image = containers[index];
       var discoverys = image.discovery;
       if (discoverys && discoverys.length > 0)
       {
          discoveryNeeded = true;
          for (var j = 0; j < discoverys.length; j ++)
          {
            var discoveryInfo = discoverys[j];
            appLogger.info("application: " + discoveryInfo.application + ", serviceName: " + discoveryInfo.serviceName + ", proxyPort: " + discoveryInfo.proxyPort);
            this.genSynapseConfig(discoveryInfo, synpaseConfigFiles);
          }
       }
    }
    if(discoveryNeeded)
    {
        this.buildMainConfigFile();
    }
    return synpaseConfigFiles;
  };
  
  
    /**
     * Generate the SynapseConfig file
     */
    this.buildMainConfigFile = function()
    {
      appLogger.info("SynapseConfigGenerator.buildMainConfigFile.enter");
      var synapseServiceConfigDir = synapseConfigPathRef + "/services"
      var mainSynapseConfigFileName = synapseConfigPathRef  + "/synapse.conf.json";

      appLogger.info("mainSynapseConfigFileName=" + mainSynapseConfigFileName);

      var mainConfigFileContent =  "" +
              "{ \r\n" +
                  "  \"service_conf_dir\":  \"" + "/opt/synapse/config/synapse_services" + "\", \r\n" +
                  "  \"haproxy\": {    \r\n" +
                  "    \"reload_command\": \"service haproxy reload\",      \r\n" +
                  "    \"config_file_path\": \"/etc/haproxy/haproxy.cfg\",  \r\n" +
                  "    \"socket_file_path\": \"/var/haproxy/stats.sock\",     \r\n" +
                  "    \"do_writes\": true,     \r\n" +
                  "    \"do_reloads\": true,    \r\n" +
                  "    \"do_socket\": false,    \r\n" +
                  "    \"bind_address\": \"*\",    \r\n" +
                  "  \"global\": [    \r\n" +
                  "      \"daemon\",    \r\n" +
                  "      \"user haproxy\",    \r\n" +
                  "      \"group haproxy\",    \r\n" +
                  "      \"maxconn 4096\",    \r\n" +
                  "      \"log     127.0.0.1 local0\",    \r\n" +
                  "      \"log     127.0.0.1 local1 notice\"     \r\n" +
                  "  ],   \r\n" +
                  "  \"defaults\": [    \r\n" +
                  "      \"log      global\",    \r\n" +
                  "      \"option   dontlognull\",    \r\n" +
                  "      \"maxconn  2000\",    \r\n" +
                  "      \"retries  3\",    \r\n" +
                  "      \"timeout  connect 5s\",    \r\n" +
                  "      \"timeout  client  1m\",    \r\n" +
                  "      \"timeout  server  1m\",    \r\n" +
                  "      \"option   redispatch\",    \r\n" +
                  "      \"balance  roundrobin\"    \r\n" +
                  "  ],  \r\n" +
                  "    \"extra_sections\": {    \r\n" +
                  "      \"listen stats :3212\": [    \r\n" +
                  "        \"mode http\",    \r\n" +
                  "        \"stats enable\",    \r\n" +
                  "        \"stats uri /\",    \r\n" +
                  "        \"stats refresh 5s\"    \r\n" +
                  "    ]   \r\n" +
                  "   }  \r\n" +
                  " }      \r\n" +
               "} \r\n";

      appLogger.info("SynapseConfigGenerator.buildMainConfigFile mainConfigFileContent=" + mainConfigFileContent);
      try
        {
          fs.writeFileSync(mainSynapseConfigFileName, mainConfigFileContent);
        }
        catch (err)
        {
          appLogger.error("SynapseConfigGenerator.buildMainConfigFile, error writing docker synapseConfig file, err=" + err);
          throw GlobalsConsts.RESULT_GEN_SYNAPSE_CONFIG_ERROR;
        }
        finally
        {
          appLogger.info("SynapseConfigGenerator.buildMainConfigFile.exit");
        }
    }



  /**
   * Generate the synapseConfig file 
   */
  this.genSynapseConfig = function(discoveryInfo, synpaseConfigFiles)
  {
    appLogger.info("SynapseConfigGenerator.genSynapseConfig.enter");

    var service = discoveryInfo.serviceName;
    var port = discoveryInfo.proxyPort;
    var application = discoveryInfo.application;
    var appId = manifestDataRef.manifest.app.id;
    const ZOOKEEPER_STR = "zookeeperCluster";

    var synapseConfigFileName = synapseConfigPathRef + "/services/" + service + ".json";

    synpaseConfigFiles.push(service + ".json");
    var synapseConfigFileContent = "";

    synapseConfigFileContent += "{ \r\n";
    synapseConfigFileContent += " \"default_servers\": [  \r\n";
    synapseConfigFileContent += "  {  \r\n";
    synapseConfigFileContent += " \"name\":" + " \"" + service + "\",  \r\n";
    synapseConfigFileContent += " \"host\":" + " \"localhost\",  \r\n";
    synapseConfigFileContent += " \"port\":"  + port + " \r\n";
    synapseConfigFileContent += "  }  \r\n";
    synapseConfigFileContent += " ],  \r\n";

    synapseConfigFileContent += " \"discovery\": {  \r\n";
    synapseConfigFileContent += "  \"method\":"  + " \"zookeeper\",  \r\n";
    synapseConfigFileContent += "  \"path\":" + "\"/acp/srd/" + application + "/" + service + "\",  \r\n";
    synapseConfigFileContent += "  \"hosts\":[ \r\n";
    synapseConfigFileContent += "   \"" + ZOOKEEPER_STR + ":2181\"   \r\n";
    synapseConfigFileContent += "  ]  \r\n";
    synapseConfigFileContent += " },  \r\n";

    synapseConfigFileContent += " \"haproxy\": {  \r\n";
    synapseConfigFileContent += "  \"port\":"  + port + ",  \r\n";
    synapseConfigFileContent += "  \"service_options\":" + " \"check inter 600s rise 2 fall 10\", \r\n";
    synapseConfigFileContent += "  \"listen\":[ \r\n";
    synapseConfigFileContent += "   \"mode http\", \r\n";
    synapseConfigFileContent += "   \"option httpchk /health\"\r\n";
    synapseConfigFileContent += "   ]  \r\n";
    synapseConfigFileContent += "  }  \r\n";
    synapseConfigFileContent += " }  \r\n";

    appLogger.info("SynapseConfigGenerator.gensynapseConfig synapseConfigFileContent=" + synapseConfigFileContent);

    try
    {
      fs.writeFileSync(synapseConfigFileName, synapseConfigFileContent);
    }
    catch (err)
    {
      appLogger.error("SynapseConfigGenerator.gensynapseConfig, error writing docker synapseConfig file, err=" + err);
      throw GlobalsConsts.RESULT_GEN_SYNAPSE_CONFIG_ERROR;
    }
    finally
    {
      appLogger.info("SynapseConfigGenerator.gensynapseConfig.exit");
    }
  }
}
