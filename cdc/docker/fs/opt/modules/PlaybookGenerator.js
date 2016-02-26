/**
 * Copyright 2015 ARRIS Enterprises, Inc. All rights reserved.
 * This program is confidential and proprietary to ARRIS Enterprises, Inc. (ARRIS),
 * and may not be copied, reproduced, modified, disclosed to others, published or used,
 * in whole or in part, without the express prior written permission of ARRIS.
 */

/**
 * This module generates the Ansible Playbook files and folder structure based on manifest info 
 */

/**
 * Import modules
 */
var appLogger = require('../utils/app_logger');
var AppInstallError = require('../modules/AppInstallError');
var Persistence = require('../modules/Persistence');
var GlobalsConsts = require('../modules/GlobalsConsts');
var fs = require('fs');
var Ansible = require('node-ansible');
var execSync = require('exec-sync');
var SwarmAPI = require('../modules/SwarmAPI');
var glob = require('glob');
var path = require('path');


/**
 * Globals
 */
var manifestDataRef;
var appPlaybooksPathRef;
var appDeployPlaybookName;
var nervePlaybookName;
var appUnDeployPlaybookName;
var clenupImagesPlaybookName;
var cremoveImagesPlaybookName;
var passwordRef;
var playbookDataRef;
var openFirewallPlaybookName;
var appStatusMapRef;
var installAppPortsRef;

var persistence;

/**
 * Consts
 */
const INVENTORY_FILENAME = "/opt/code_controller/deploy/inventory";
const RESOURCES_INVENTORY_FILENAME = "/opt/code_controller/deploy/resources";
const DEPLOY_FILEPATH = "/opt/code_controller/deploy";
const NERVE_CONFIG_PATH = "/opt/code_controller/deploy/srdconfig/nerve/config";

/**
 * Module class definition
 */
module.exports = function(appStatusMap, manifestData, appPlaybooksPath, password, playbookData, installAppPorts) 
{
  appLogger.info("PlaybookGenerator.enter, appPlaybooksPath=" + appPlaybooksPath );

  appStatusMapRef = appStatusMap;
  manifestDataRef = manifestData;
  appPlaybooksPathRef = appPlaybooksPath;
  passwordRef = password;
  playbookDataRef = playbookData;
  installAppPortsRef = installAppPorts;

  var openFirewall = false;
 
  var appId = manifestDataRef.manifest.app.id;
  var version = manifestDataRef.manifest.app.version;

  var composeFullFileName = appPlaybooksPathRef + "/" + appId + "-compose.yml";
  var composeFileName = appId + "-compose.yml";
  
  var nerveComposeFullFileName =  DEPLOY_FILEPATH + "/nerve" + "/nerve-compose.yml";
  var nerveComposeFileName =  "nerve-compose.yml";

  nervePlaybookName = appPlaybooksPathRef + "/" + appId + "-nerve.yml";
  
  appDeployPlaybookName = appPlaybooksPathRef + "/" + appId + "-deploy.yml"
  appUnDeployPlaybookName = appPlaybooksPathRef + "/" + appId + "-undeploy.yml"
  
  clenupImagesPlaybookName =  appPlaybooksPathRef + "/" + appId + "-cleanup.yml"
  removeImagesPlaybookName =  DEPLOY_FILEPATH + "/removeImages.yml"
  
  openFirewallPlaybookName = appPlaybooksPathRef + "/" + appId + "-openFirewall.yml"
  closeFirewallPlaybookName = appPlaybooksPathRef + "/" + appId + "-closeFirewall.yml"
  
  var configFileName = appPlaybooksPathRef + "/ansible.cfg"

  var sshUser = {ansible_ssh_user: "fldengr"};
  var sshPass = {ansible_ssh_pass: passwordRef};
      
  /**
   * Create the playbook to open the firewall
   */
  this.genOpenFirewallPlaybook = function()
  {
    appLogger.info("PlaybookGenerator.genOpenFirewallPlaybook.enter");

    try 
    {
      var portListStr = this.genPortListString();
      appLogger.info("PlaybookGenerator.genOpenFirewallPlaybook - Ports = " + portListStr);
      
      if (portListStr && portListStr !== "")
      {
        var firewallPlaybookContent = "---\r\n" +
         "- name: Open the required ports for application\r\n" +
         "  hosts: swarm\r\n" +
         "  sudo: yes\r\n" +
         "  remote_user: fldengr\r\n" +
         "  tasks:\r\n" +
         "   - name: Grab iptables rules for survey of firewall (INPUT rules only)\r\n" +
         "     shell: iptables -n --list INPUT\r\n" +
         "     register: iptablesinputtablerules\r\n" +
         "     always_run: yes\r\n" +
         "   - name: punch the hole in the firewall for codecontroller\r\n" +
         "     command: iptables -I INPUT -p tcp --dport {{ item }} -j ACCEPT\r\n" +
         "     when: iptablesinputtablerules.stdout.find(\"dpt:{{ item }}\") == -1\r\n" +
         "     with_items:\r\n" + portListStr +
         "   - name: Save the firewall\r\n" +
         "     shell: service iptables save\r\n" +
         "     ignore_errors: yes"; 

        appLogger.info("PlaybookGenerator.genOpenFirewallPlaybook, firewallPlaybookContent=\r\n" + 
                       firewallPlaybookContent);
        fs.writeFileSync(openFirewallPlaybookName, firewallPlaybookContent);
        openFirewall = true;
      }
    }
    catch (err)
    {
      appLogger.error("PlaybookGenerator.genOpenFirewallPlaybook, error writing openFirewallPlaybookName=" +
                    openFirewallPlaybookName + ", err=" + err);
      throw GlobalsConsts.RESULT_GEN_PLAYBOOK_FILE_ERROR;
    }
    finally
    {
      appLogger.info("PlaybookGenerator.genOpenFirewallPlaybook.exit");
    }                  
  }

  /**
   * Create the playbook to open the firewall
   */
  this.genCloseFirewallPlaybook = function()
  {
    appLogger.info("PlaybookGenerator.genCloseFirewallPlaybook.enter - " + closeFirewallPlaybookName);
    try 
    {   
      var portListStr = this.genPortListString();
      if (portListStr && portListStr !== "")
      {
        var firewallPlaybookContent = "---\r\n" +
         "- name: Close the ports opened for the application\r\n" +
         "  hosts: swarm\r\n" +
         "  sudo: yes\r\n" +
         "  gather_facts: False\r\n" +
         "  remote_user: fldengr\r\n" +
         "  tasks:\r\n" +
         "   - name: Grab iptables rules for survey of firewall (INPUT rules only)\r\n" +
         "     shell: iptables -n --list INPUT\r\n" +
         "     register: iptablesinputtablerules\r\n" +
         "     always_run: yes\r\n" +
         "   - name: remove the firewall rules for application\r\n" +
         "     command: iptables -D INPUT -p tcp --dport {{ item }} -j ACCEPT\r\n" +
         "     when: iptablesinputtablerules.stdout.find(\"dpt:{{ item }}\") == -1\r\n" +
         "     with_items:\r\n" + portListStr + "\r\n" +
         "     ignore_errors: yes\r\n" +
         "   - name: Save the firewall\r\n" +
         "     shell: service iptables save\r\n" +
         "     ignore_errors: yes"; 

        appLogger.info("PlaybookGenerator.genCloseFirewallPlaybook, firewallPlaybookContent=\r\n" + 
                       firewallPlaybookContent);
        fs.writeFileSync(closeFirewallPlaybookName, firewallPlaybookContent);
        closeFirewall = true;
      }
    }
    catch (err)
    {
      appLogger.error("PlaybookGenerator.genCloseFirewallPlaybook, error writing closeFirewallPlaybookName=" +
                    closeFirewallPlaybookName + ", err=" + err);
      throw GlobalsConsts.RESULT_GEN_PLAYBOOK_FILE_ERROR;
    }
    finally
    {
      appLogger.info("PlaybookGenerator.genCloseFirewallPlaybook.exit");
    }                  
  }

  /**
   * Create the playbook to remove images from swarm nodes
   */
  this.genClenupImagesPlaybook = function()
  {
    appLogger.info("PlaybookGenerator.genClenupImagesPlaybook.enter");
    try 
    {     
        var genClenupImagesPlaybookContent = "---\r\n" +
         "- name: Remove the non running images \r\n" +
         "  hosts: swarm\r\n" +
         "  sudo: yes\r\n" +
         "  gather_facts: False\r\n" +
         "  remote_user: fldengr\r\n" +
         "  tasks:\r\n" +
         "  - name: Copy getImages to swarm\r\n" +
 	  	 "    copy: src=/getImages.sh dest=/usr/sbin/ mode=0755\r\n" +
 	     "  - name: get non running images from swarm\r\n" +
 		 "    command: /usr/sbin/getImages.sh\r\n" +
 		 "    register: images\r\n" +
 	     "    ignore_errors: yes\r\n" +
 		 "  - name: Remove non running images from swarm cluster\r\n" +
 		 "    command: sudo docker rmi -f {{ item }}\r\n" +
 		 "    with_items: images.stdout\r\n" +
 		 "    ignore_errors: yes\r\n"; 

        appLogger.info("PlaybookGenerator.genClenupImagesPlaybook, genClenupImagesPlaybookContent=\r\n" + 
        		genClenupImagesPlaybookContent);
        fs.writeFileSync(clenupImagesPlaybookName, genClenupImagesPlaybookContent);
    }
    catch (err)
    {
      appLogger.error("PlaybookGenerator.genClenupImagesPlaybook, error writing clenupImagesPlaybookName=" +
    		  clenupImagesPlaybookName + ", err=" + err);
      throw GlobalsConsts.RESULT_GEN_PLAYBOOK_FILE_ERROR;
    }
    finally
    {
      appLogger.info("PlaybookGenerator.genClenupImagesPlaybook.exit");
    }                  
  }
  
  /**
   * Create the playbook to remove images from dockerRepo
   */
  this.genRemoveImagesPlaybook = function()
  {
    appLogger.info("PlaybookGenerator.genRemoveImagesPlaybook.enter");
    var imageList = this.genImageListString();
 
    try 
    {     
        var genRemoveImagesPlaybookContent = "---\r\n" +
         "- name: Remove the non running images \r\n" +
         "  hosts: dockerrepo\r\n" +
         "  sudo: yes\r\n" +
         "  gather_facts: False\r\n" +
         "  remote_user: fldengr\r\n" +
         "  tasks:\r\n" + 
 		 "  - name: Remove non running images from swarm cluster\r\n" +
 		 "    command: sudo docker rmi -f {{ item }}\r\n" +
 		 "    with_items:\r\n" + imageList +
 		 "    ignore_errors: yes\r\n"; 

        appLogger.info("PlaybookGenerator.genRemoveImagesPlaybook, genRemoveImagesPlaybookContent=\r\n" + 
        		genRemoveImagesPlaybookContent);
        
        
        var ansible_config = "[defaults]\n" +
			"hostsfile = ./inventory\n" +
			"remote_user = fldengr\n" +
			"host_key_checking = False\n" +
			"log_path = " + DEPLOY_FILEPATH + "/ansible.log";
        
        fs.writeFileSync(removeImagesPlaybookName, genRemoveImagesPlaybookContent);
        fs.writeFileSync(DEPLOY_FILEPATH + "/ansible.cfg", ansible_config);
    }
    catch (err)
    {
      appLogger.error("PlaybookGenerator.genRemoveImagesPlaybook, error writing removeImagesPlaybookName=" +
    		  removeImagesPlaybookName + ", err=" + err);
      throw GlobalsConsts.RESULT_GEN_PLAYBOOK_FILE_ERROR;
    }
    finally
    {
      appLogger.info("PlaybookGenerator.genRemoveImagesPlaybookContent.exit");
    }                  
  }
  /**
   * Generate the playbook
   */
  this.genDeployPlaybook = function() 
  {
    appLogger.info("PlaybookGenerator.genDeployPlaybook.enter, appDeployPlaybookName=" + appDeployPlaybookName);

    var scaleRunString = this.genScaleComposeString();
    
    var deployPlaybookContent = "---\r\n" +
    		"- name: Deploy application " + appId + ":" + version + " on swarm nodes\r\n" +
    		"  hosts: swarmmgt\r\n" +
    		"  sudo: no\r\n" +
    		"  remote_user: fldengr\r\n\n" +
    		"  tasks:\r\n" +
    		"  - name: get the swarm vip\r\n" +
    		"    shell: host swarmcluster | cut -d\" \" -f4\r\n" +
    		"    register: swarm\r\n" +
    		"  - name: Copy the compose file on swarm mgmt nodes\r\n" +
    		"    sudo: yes\r\n" +
    		"    copy: src=" + composeFullFileName + " dest=/arris/compose/" + composeFileName + "\r\n" +
    		"  - name:  start the compose file " + appId + ":" + version + "\r\n" +
    		"    environment:\r\n" +
    		"     DOCKER_HOST: \"{{ swarm.stdout }}:2377\"\r\n" +
    		"    command: sudo -E docker-compose -f /arris/compose/" + composeFileName + " up -d \r\n" +
    		"    register: compose\r\n" +
    		"    run_once: true\r\n" +
    		"  - debug: msg=Compose Respnose for App Deploy = {{ compose.stdout }}\r\n" +
    		"  - name:  start the scale containers for " + appId + ":" + version + "\r\n" +
    		"    environment:\r\n" +
    		"     DOCKER_HOST: \"{{ swarm.stdout }}:2377\"\r\n" +
    		"    command: sudo -E docker-compose -f /arris/compose/" + composeFileName + scaleRunString + "\r\n" +
    		"    register: compose\r\n" +
    		"    run_once: true\r\n" +
    		"  - debug: msg=Compose Response for App Scale = {{ compose.stdout }}\r\n";
    
    var ansible_config = "[defaults]\n" +
    		"hostsfile = ./inventory\n" +
    		"remote_user = fldengr\n" +
    		"host_key_checking = False\n" +
    		"log_path = " + appPlaybooksPathRef + "/" + appId + "-ansible.log";
    
    try
    {
      appLogger.info("PlaybookGenerator.genDeployPlaybook, deployPlaybookContent=" + deployPlaybookContent);
      fs.writeFileSync(appDeployPlaybookName, deployPlaybookContent);      
      fs.writeFileSync(configFileName, ansible_config);
    }
    catch (err)
    {
      appLogger.error("PlaybookGenerator.genDeployPlaybook, error writing playbook file, err=" + err);
      throw GlobalsConsts.RESULT_GEN_PLAYBOOK_FILE_ERROR;
    }
    finally
    {
      appLogger.info("PlaybookGenerator.genDeployPlaybook.exit");
    }
  }
  
  /**
   * Generate the playbook for UnDeploy
   */
  this.genUnDeployPlaybook = function() 
  {
    appLogger.info("PlaybookGenerator.genUnDeployPlaybook.enter, appUnDeployPlaybookName=" + appUnDeployPlaybookName);
   
    var unDeployPlaybookContent = "---\r\n" +
    		"- name: UnDeploy application on swarm nodes\r\n" +
    		"  hosts: swarmmgt\r\n" +
    		"  sudo: no\r\n" +
    		"  remote_user: fldengr\r\n\n" +
    		"  tasks:\r\n" +
    		"  - name: get the swarm vip\r\n" +
    		"    shell: host swarmcluster | cut -d\" \" -f4\r\n" +
    		"    register: swarm\r\n" +
    		"  - name:  stop the compose file\r\n" +
    		"    environment:\r\n" +
    		"     DOCKER_HOST: \"{{ swarm.stdout }}:2377\"\r\n" +
    		"    command: sudo -E docker-compose -f /arris/compose/" + composeFileName + " stop\r\n" +
    		"    run_once: true\r\n" +
    		"  - name:  remove the containers\r\n" +
    		"    environment:\r\n" +
    		"     DOCKER_HOST: \"{{ swarm.stdout }}:2377\"\r\n" +
    		"    command: sudo -E docker-compose -f /arris/compose/" + composeFileName + " rm --force\r\n" +
    		"    register: compose\r\n" +
    		"    run_once: true\r\n" +
    		"  - debug: msg=Compose Response For Undeploy= {{ compose.stdout }}\r\n" +
    		"  - name: Remove the compose file from swarm mgmt nodes\r\n" +
    		"    sudo: yes\r\n" +
    		"    file: path=/arris/compose/" + composeFileName + " state=absent\r\n" ;
        
    try
    {
      appLogger.info("PlaybookGenerator.genUnDeployPlaybook, UnDeployPlaybookContent=" + unDeployPlaybookContent);
      fs.writeFileSync(appUnDeployPlaybookName, unDeployPlaybookContent);      
    }
    catch (err)
    {
      appLogger.error("PlaybookGenerator.genUnDeployPlaybook, error writing playbook file, err=" + err);
      throw GlobalsConsts.RESULT_GEN_PLAYBOOK_FILE_ERROR;
    }
    finally
    {
      appLogger.info("PlaybookGenerator.genUnDeployPlaybook.exit");
    }
  }
  
  /**
   * Run the Deploy playbooks
   */
  this.runDeploy = function()
  {
    appLogger.info("PlaybookGenerator.runDeploy.enter");

    var appId = manifestDataRef.manifest.app.id;
    var appVersion = manifestDataRef.manifest.app.version;
 
    if (openFirewall)
    { 
      //run the open firewall playbook
      var openFirewallPlaybook = new Ansible.Playbook().playbook(appId + "-openFirewall");

      openFirewallPlaybook.inventory(RESOURCES_INVENTORY_FILENAME);
      openFirewallPlaybook.variables(sshUser);
      openFirewallPlaybook.variables(sshPass);

      appLogger.info("appPlaybooksPathRef = " + appPlaybooksPathRef);
    	
      var promise = openFirewallPlaybook.exec({cwd:appPlaybooksPathRef});
      promise.then(
        function(successResult)
        {
          appLogger.info("PlaybookGenerator.run, successfully executed playbook=" + openFirewallPlaybookName +
                         ", successResult.code=" + successResult.code + 
                         ", successResult.output=" + successResult.output);

          appLogger.info("Current workign dir" + process.cwd()); 
          
          runMainPlaybook();
        },

        function(err)
        {
          appLogger.error("PlaybookGenerator.run, error executed playbook=" + openFirewallPlaybookName +
                       ", err=" + err);

          appStatusMapRef[appId + ":" + appVersion].resultCode = GlobalsConsts.RESULT_PLAYBOOK_RUN_ERROR,
          appStatusMapRef[appId + ":" + appVersion].lastChange = new Date().toISOString();
 
          appLogger.info("PlaybookGenerator.run, changing appStatus to: appStatus=" +
                         JSON.stringify(appStatusMapRef[appId + ":" + appVersion]));
          persistence= new Persistence(appId, appVersion, JSON.stringify({}),JSON.stringify({}),JSON.stringify(appStatusMapRef[appId + ":" + appVersion]));
          persistence.setAppdeploystatusDB(function (message) {
            appLogger.info('setAppdeploystatusDB operation = ' + message);
          });
        }
      ); 
    }
    else
    {
      runMainPlaybook();
    }

    appLogger.info("PlaybookGenerator.run.exit");
  }	

  runMainPlaybook = function()
  {
    appLogger.info("PlaybookGenerator.runMainPlaybook.enter");

    var appId = manifestDataRef.manifest.app.id;
    var appVersion = manifestDataRef.manifest.app.version;

    var ansiblePlaybook = new Ansible.Playbook().playbook(appId + "-deploy");

    try
    {
      var command = "curl -s -o " + INVENTORY_FILENAME + " " + "http://dockerrepo/service-scripts/playbooks/inventory";
      content = execSync(command);
      appLogger.info("PlaybookGenerator wget inventory file ");
    }
    catch (err)
    {
      appLogger.error("PlaybookGenerator wget inventory file, err=" + err);
      throw GlobalsConsts.RESULT_FILE_NOT_FOUND;
    } 

    ansiblePlaybook.inventory(INVENTORY_FILENAME);
    ansiblePlaybook.variables(sshUser);
    ansiblePlaybook.variables(sshPass);

    var promise = ansiblePlaybook.exec({cwd:appPlaybooksPathRef});
    promise.then(
      function(successResult)
      {

        //update the status map
        appStatusMapRef[appId + ":" + appVersion].stateCode = GlobalsConsts.APP_STATE_COMPLETE_DEPLOY,
        appStatusMapRef[appId + ":" + appVersion].resultCode = GlobalsConsts.RESULT_OK,
        appStatusMapRef[appId + ":" + appVersion].lastChange = new Date().toISOString();

        appLogger.info("PlaybookGenerator.run, changing appStatus to: appStatus=" +
                       JSON.stringify(appStatusMapRef[appId + ":" + appVersion]));
        persistence= new Persistence(appId, appVersion, JSON.stringify({}),JSON.stringify(appStatusMapRef[appId + ":" + appVersion]));
        persistence.setAppdeploystatusDB(function (message) {
          appLogger.info('setAppdeploystatusDB operation = ' + message);
        });

        appLogger.info("PlaybookGenerator.runMainPlaybook, successfully executed playbook=" + appDeployPlaybookName +
                       ", successResult.code=" + successResult.code +
                       ", successResult.output=" + successResult.output);

      },

      function(err)
      {
        appLogger.error("PlaybookGenerator.runMainPlaybook, error executed playbook=" + appDeployPlaybookName +
                       ", err=" + err);

        appStatusMapRef[appId + ":" + appVersion].resultCode = GlobalsConsts.RESULT_PLAYBOOK_RUN_ERROR,
        appStatusMapRef[appId + ":" + appVersion].lastChange = new Date().toISOString();

        appLogger.info("PlaybookGenerator.run, changing appStatus to: appStatus=" +
                       JSON.stringify(appStatusMapRef[appId + ":" + appVersion]));
        persistence= new Persistence(appId, appVersion, JSON.stringify({}),JSON.stringify(appStatusMapRef[appId + ":" + appVersion]));
        persistence.setAppdeploystatusDB(function (message) {
          appLogger.info('setAppdeploystatusDB operation = ' + message);
        });
      } 
    );
  }

  /**
   * Run the closeFirewalls playbooks
   */
  runCloseFirewall = function()
  {
    appLogger.info("PlaybookGenerator.runCloseFirewall.enter");

    var appId = manifestDataRef.manifest.app.id;
    var appVersion = manifestDataRef.manifest.app.version;
 
    if (closeFirewall)
    { 
      //run the close firewall playbook
      var closeFirewallPlaybook = new Ansible.Playbook().playbook(appId + "-closeFirewall");

      closeFirewallPlaybook.inventory(RESOURCES_INVENTORY_FILENAME);
      closeFirewallPlaybook.variables(sshUser);
      closeFirewallPlaybook.variables(sshPass);

      var promise = closeFirewallPlaybook.exec({cwd:appPlaybooksPathRef});
      promise.then(
        function(successResult)
        {
          appLogger.info("PlaybookGenerator.runCloseFirewall, successfully executed playbook=" + closeFirewallPlaybookName +
                         ", successResult.code=" + successResult.code + 
                         ", successResult.output=" + successResult.output);         
        },

        function(err)
        {
          appLogger.error("PlaybookGenerator.runCloseFirewall, error executed playbook=" + closeFirewallPlaybookName +
                       ", err=" + err);

          appStatusMapRef[appId + ":" + appVersion].resultCode = GlobalsConsts.RESULT_PLAYBOOK_RUN_ERROR,
          appStatusMapRef[appId + ":" + appVersion].lastChange = new Date().toISOString();
 
          appLogger.info("PlaybookGenerator.runCloseFirewall, changing appStatus to: appStatus=" +
                         JSON.stringify(appStatusMapRef[appId + ":" + appVersion]));
          persistence= new Persistence(appId, appVersion, JSON.stringify({}),JSON.stringify(appStatusMapRef[appId + ":" + appVersion]));
          persistence.setAppdeploystatusDB(function (message) {
            appLogger.info('setAppdeploystatusDB operation = ' + message);
          });
        }
      ); 
    }
    appLogger.info("PlaybookGenerator.runCloseFirewall.exit");
  }	
  
  
  /**
   * Run the UnDeploy playbook
   */
  this.runUnDeploy = function()
  {
    appLogger.info("PlaybookGenerator.runUnDeploy.enter");

    var appId = manifestDataRef.manifest.app.id;
    var appVersion = manifestDataRef.manifest.app.version;

    nerveConfigFiles = NERVE_CONFIG_PATH + "/services/" + appId + "_" + appVersion + "*.json";
    nerveserviceFiles = NERVE_CONFIG_PATH + "/services/*.json";
    serviceConfigFile = NERVE_CONFIG_PATH + "/services/serviceConfigFiles.json";
	var filesToDelete = [];

    appLogger.info("Nerve Config Files " +  nerveConfigFiles);

	glob(nerveConfigFiles, function(err, files) {
	  	    files.forEach(function(file) {
	    	filesToDelete.push(file);
	    });
	});
	 
	var tmp = [];
	var content = "";

	//Emtpy config file
	try
    {
      fs.writeFileSync(NERVE_CONFIG_PATH + "/services/serviceConfigFiles.json", content);
    }
    catch (err)
    {
      appLogger.error("Error writing serviceConfigFile for Nerve, err=" + err);
      return callback(null, false);
    }
	
    appLogger.info("Generated empty Serviceconfig File: ");
    
	glob(nerveserviceFiles, function(err, files) {
	 tmp = files.filter(function(file){
	     var name = path.basename(file);
		  if( (filesToDelete.indexOf(file) < 0) && (name != "serviceConfigFiles.json") ) {
			  appLogger.info("Save Files file =" + file);	
			  content = content  + " " + path.basename(file);
			  try
			    {
			      fs.writeFileSync(NERVE_CONFIG_PATH + "/services/serviceConfigFiles.json", content);
			    }
			    catch (err)
			    {
			      appLogger.error("Error writing serviceConfigFile for Nerve, err=" + err);
			      return callback(null, false);
			    }
			return file;
		  }
		});		
	});
	  
    appLogger.info("Serviceconfig File created... Will run undeploy playbook now ");
    var ansiblePlaybook = new Ansible.Playbook().playbook(appId + "-undeploy");

    try
    {
      var command = "curl -s -o " + INVENTORY_FILENAME + " " + "http://dockerrepo/service-scripts/playbooks/inventory";
      content = execSync(command);
      appLogger.info("PlaybookGenerator wget inventory file ");
    }
    catch (err)
    {
      appLogger.error("PlaybookGenerator wget inventory file, err=" + err);
      throw GlobalsConsts.RESULT_FILE_NOT_FOUND;
    } 

    ansiblePlaybook.inventory(INVENTORY_FILENAME);
    ansiblePlaybook.variables(sshUser);
    ansiblePlaybook.variables(sshPass);

    var promise = ansiblePlaybook.exec({cwd:appPlaybooksPathRef});
    promise.then(
      function(successResult)
      { 	     	
    	runCloseFirewall();    
    	runCleanup(); 
    	
        //update the status map
         appStatusMapRef[appId + ":" + appVersion].stateCode = GlobalsConsts.APP_STATE_COMPLETE_UNDEPLOY,
         appStatusMapRef[appId + ":" + appVersion].resultCode = GlobalsConsts.RESULT_OK,
         appStatusMapRef[appId + ":" + appVersion].lastChange = new Date().toISOString();

         appLogger.info("PlaybookGenerator.runUnDeploy, changing appStatus to: appStatus=" +
                        JSON.stringify(appStatusMapRef[appId + ":" + appVersion]));
         persistence= new Persistence(appId, appVersion, JSON.stringify({}),JSON.stringify(appStatusMapRef[appId + ":" + appVersion]));
         persistence.setAppdeploystatusDB(function (message) {
           appLogger.info('setAppdeploystatusDB operation = ' + message);
         });
    	  
        appLogger.info("PlaybookGenerator.runUnDeploy, successfully executed playbook=" + appUnDeployPlaybookName +
                       ", successResult.code=" + successResult.code +
                       ", successResult.output=" + successResult.output);
      },
      function(err)
      {
        appLogger.error("PlaybookGenerator.runUnDeploy, error executed playbook=" + appUnDeployPlaybookName +
                       ", err=" + err);

        appStatusMapRef[appId + ":" + appVersion].resultCode = GlobalsConsts.RESULT_PLAYBOOK_RUN_ERROR,
        appStatusMapRef[appId + ":" + appVersion].lastChange = new Date().toISOString();

        appLogger.info("PlaybookGenerator.run, changing appStatus to: appStatus=" +
                       JSON.stringify(appStatusMapRef[appId + ":" + appVersion]));
        persistence= new Persistence(appId, appVersion, JSON.stringify({}),JSON.stringify(appStatusMapRef[appId + ":" + appVersion]));
        persistence.setAppdeploystatusDB(function (message) {
          appLogger.info('setAppdeploystatusDB operation = ' + message);
        });
      } 
    );
  }
  
  /**
   * Run the Cleanup playbooks
   */
  runCleanup = function()
  {
    appLogger.info("PlaybookGenerator.runCleanup.enter");

    var appId = manifestDataRef.manifest.app.id;
    var appVersion = manifestDataRef.manifest.app.version;
 
        //run theclenaup playbook
    var clenaupPlaybook = new Ansible.Playbook().playbook(appId + "-cleanup");
	
	clenaupPlaybook.inventory(RESOURCES_INVENTORY_FILENAME);
	clenaupPlaybook.variables(sshUser);
	clenaupPlaybook.variables(sshPass);

    var promise = clenaupPlaybook.exec({cwd:appPlaybooksPathRef});
    promise.then(
       function(successResult)
        {
          appLogger.info("PlaybookGenerator.runCleanup, successfully executed playbook=" + clenupImagesPlaybookName +
                         ", successResult.code=" + successResult.code + 
                         ", successResult.output=" + successResult.output);
        },
        function(err)
        {
          appLogger.error("PlaybookGenerator.runCleanup, error executed playbook=" + clenupImagesPlaybookName +
                       ", err=" + err);

          appStatusMapRef[appId + ":" + appVersion].resultCode = GlobalsConsts.RESULT_PLAYBOOK_RUN_ERROR,
          appStatusMapRef[appId + ":" + appVersion].lastChange = new Date().toISOString();
 
          appLogger.info("PlaybookGenerator.runCleanup, changing appStatus to: appStatus=" +
                         JSON.stringify(appStatusMapRef[appId + ":" + appVersion]));
          persistence= new Persistence(appId, appVersion, JSON.stringify({}),JSON.stringify(appStatusMapRef[appId + ":" + appVersion]));
          persistence.setAppdeploystatusDB(function (message) {
            appLogger.info('setAppdeploystatusDB operation = ' + message);
          });
        }
      );   
    appLogger.info("PlaybookGenerator.runCleanup.exit");
  }	
  
  /**
   * Run the Cleanup playbooks
   */
  runRemoveImages = function()
  {
    appLogger.info("PlaybookGenerator.runRemoveImages.enter");

    var appId = manifestDataRef.manifest.app.id;
    var appVersion = manifestDataRef.manifest.app.version;
 
        //run theclenaup playbook
    var clenaupPlaybook = new Ansible.Playbook().playbook("removeImages");
	
	clenaupPlaybook.inventory(INVENTORY_FILENAME);
	clenaupPlaybook.variables(sshUser);
	clenaupPlaybook.variables(sshPass);

    var promise = clenaupPlaybook.exec({cwd:DEPLOY_FILEPATH});
    promise.then(
       function(successResult)
        {
          appLogger.info("PlaybookGenerator.runRemoveImages, successfully executed playbook=" + clenupImagesPlaybookName +
                         ", successResult.code=" + successResult.code + 
                         ", successResult.output=" + successResult.output);
        },
        function(err)
        {
          appLogger.error("PlaybookGenerator.runRemoveImages, error executed playbook=" + clenupImagesPlaybookName +
                       ", err=" + err);

          appStatusMapRef[appId + ":" + appVersion].resultCode = GlobalsConsts.RESULT_PLAYBOOK_RUN_ERROR,
          appStatusMapRef[appId + ":" + appVersion].lastChange = new Date().toISOString();
 
          appLogger.info("PlaybookGenerator.runRemoveImages, changing appStatus to: appStatus=" +
                         JSON.stringify(appStatusMapRef[appId + ":" + appVersion]));
          persistence= new Persistence(appId, appVersion, JSON.stringify({}),JSON.stringify(appStatusMapRef[appId + ":" + appVersion]));
          persistence.setAppdeploystatusDB(function (message) {
            appLogger.info('setAppdeploystatusDB operation = ' + message);
          });
        }
      );   
    appLogger.info("PlaybookGenerator.runRemoveImages.exit");
  }	
  /**
   * Compose the scale docker-compose run string 
   */
  this.genScaleComposeString = function()
  {
    appLogger.info("PlaybookGenerator.genScaleComposeString.enter");
    
    var runString = ""; 
    var scaleData = playbookDataRef.scaleData;

    if (scaleData && scaleData.length)
    {
      runString += " scale";
      for (var i = 0; i < scaleData.length; i ++)
      {
        runString += " " + scaleData[i].containerName + "=" + scaleData[i].scale; 
      }
    }

    appLogger.info("PlaybookGenerator.genScaleComposeString, runString=" + runString);
    appLogger.info("PlaybookGenerator.genScaleComposeString.exit");
    return runString;
  }

  /**
   * Compose the port list string for open firewall
   */
  this.genPortListString = function()
  {
  
    appLogger.info("PlaybookGenerator.genPortListString.enter");
   
    var appId = manifestDataRef.manifest.app.id;
    var appVersion = manifestDataRef.manifest.app.version;   
    
    var portListString = "";
    var portList =  installAppPortsRef[appId + ":" + appVersion].ports;

    var tmp = [];
    if (portList && portList.length)
    {
      for (var i = 0; i < portList.length; i ++)
      {
    	if (tmp.indexOf(portList[i]) < 0)
		{
    	   appLogger.info("Adding entry " + portList[i]);
		   tmp.push(portList[i]);
		   portListString += "      - " + portList[i] + "\r\n";
		}
      }
    }

    appLogger.info("PlaybookGenerator.genPortListString, portListString=" + portListString);
    appLogger.info("PlaybookGenerator.genPortListString.exit");
    return portListString;
  }

  
  this.genImageListString = function()
  {
  
    appLogger.info("PlaybookGenerator.genImageListString.enter");
   
    var appId = manifestDataRef.manifest.app.id;
    var appVersion = manifestDataRef.manifest.app.version;   
    var containers = manifestDataRef.manifest.app.containers;
    
    var imageListString = "";
    
    for (var index in containers) 
    {
      var image = containers[index];
      appLogger.info("DockerAPI.remove, from manifest.json info - Image No.: " + index + 
                     ", imageName: " + image.imageName + ", version: " + image.version + 
                     ", imageFile: " + image.imageSource.imageFile);

      var imageToDelete = "dockerrepo:5000/" + image.imageName + ":" + image.version;   
      var images = "      - " + imageToDelete + "\r\n" +
      			   "      - " + image.imageName + ":" + image.version + "\r\n";
      appLogger.info("DockerAPI.remove, delete image form repo : " + imageToDelete);
      imageListString += images ;
           
    }
      
    appLogger.info("PlaybookGenerator.genImageListString, ImageListString=" + imageListString);
    appLogger.info("PlaybookGenerator.genImageListString.exit");
    return imageListString;
  }
  
  /**
   * Generate the playbook name without the extention - required by the node-ansible module
   */
  this.genPlaybookName = function(playbookName)
  {   
    appLogger.info("PlaybookGenerator.genPlaybookName.enter, playbookName=" + playbookName);
 
    var playbookNameSplits = playbookName.split('.');

    var playbookNameNoExt = "";
    for (var i = 0; i < (playbookNameSplits.length - 1); i ++)
    {
      playbookNameNoExt += playbookNameSplits[i];

      if (i < (playbookNameSplits.length - 2))
      {
        playbookNameNoExt += ".";
      }
    }

    appLogger.info("PlaybookGenerator.genPlaybookName, playbookNameNoExt=" + playbookNameNoExt);
    appLogger.info("PlaybookGenerator.genPlaybookName.exit");
    return playbookNameNoExt; 
  }
 
  /**
   * Generate the nerve deploy playbook
   */
  this.genNervePlaybook = function() 
  {
    appLogger.info("PlaybookGenerator.genNervePlaybook.enter, nervePlaybookName=" + nervePlaybookName);

    var nervePlaybookContent = "---\r\n" +
    		"- name: Deploy Nerve on swarm nodes\r\n" +
    		"  hosts: swarmmgt\r\n" +
    		"  sudo: no\r\n" +
    		"  gather_facts: False\r\n" +
    		"  remote_user: fldengr\r\n\n" +
    		"  tasks:\r\n" +
    		"  - name: get the swarm vip\r\n" +
    		"    local_action: shell host swarmcluster | cut -d\" \" -f4\r\n" +
    		"    register: swarm\r\n" +
    		"  - name: Copy the nerve compose file on swarm mgmt nodes\r\n" +
    		"    sudo: yes\r\n" +
    		"    copy: src=" + nerveComposeFullFileName + " dest=/arris/compose/" + nerveComposeFileName + "\r\n" +
    		"  - name:  stop nerve container\r\n" +
    		"    environment:\r\n" +
    		"     DOCKER_HOST: \"{{ swarm.stdout }}:2377\"\r\n" +
    		"    command: sudo -E docker-compose -f /arris/compose/" + nerveComposeFileName + " stop \r\n" +
    		"    run_once: true\r\n" +
    		"    register: compose\r\n" +
    		"  - debug: msg={{ compose.stdout }}\r\n" +
    		"  - name: check if serviceConfig file size > 0\r\n" +
    		"    local_action: shell cat " + NERVE_CONFIG_PATH + "/services/serviceConfigFiles.json | wc -c\r\n" +
    		"    register: size \r\n" +
    		"  - debug: msg={{ size.stdout }}\r\n" +
    		"  - name:  restart the nerve compose file only if services are there to register\r\n" +
    		"    environment:\r\n" +
    		"     DOCKER_HOST: \"{{ swarm.stdout }}:2377\"\r\n" +
    		"    command: sudo -E docker-compose -f /arris/compose/" + nerveComposeFileName + " up -d \r\n" +
    		"    when: size.stdout != \"0\" \r\n" +
    		"    run_once: true\r\n" +
    		"    register: compose\r\n" +
    		"  - debug: msg={{ compose.stdout }}\r\n" +
    		"    when: size.stdout != \"0\" \r\n";

    
    try
    {
      appLogger.info("PlaybookGenerator.genNervePlaybook, nervePlaybookContent=" + nervePlaybookContent);
      fs.writeFileSync(nervePlaybookName, nervePlaybookContent);      
    }
    catch (err)
    {
      appLogger.error("PlaybookGenerator.genNervePlaybook, error writing playbook file, err=" + err);
      throw GlobalsConsts.RESULT_GEN_PLAYBOOK_FILE_ERROR;
    }
    finally
    {
      appLogger.info("PlaybookGenerator.genNervePlaybook.exit");
    }
  }

  this.runOpenFirewallPlaybook = function ()
  {
      appLogger.info("PlaybookGenerator.runOpenFirewallPlaybook.enter");

   	  if (openFirewall)
   	  {
   	    //run the open firewall playbook
   		var openFirewallPlaybook = new Ansible.Playbook().playbook(appId + "-openFirewall");

   		openFirewallPlaybook.inventory(RESOURCES_INVENTORY_FILENAME);
   		openFirewallPlaybook.variables(sshUser);
   		openFirewallPlaybook.variables(sshPass);

   		appLogger.info("appPlaybooksPathRef = " + appPlaybooksPathRef);

   		var promise = openFirewallPlaybook.exec({cwd:appPlaybooksPathRef});
   		promise.then(
   		  function(successResult)
   		  {
   		    appLogger.info("PlaybookGenerator.run, successfully executed playbook=" + openFirewallPlaybookName +
   		                   ", successResult.code=" + successResult.code +
   		                   ", successResult.output=" + successResult.output);
   		  },
   		  function(err)
   		  {
   		    appLogger.error("PlaybookGenerator.run, error executed playbook=" + openFirewallPlaybookName +
   		                 ", err=" + err);

   		    appStatusMapRef[appId + ":" + appVersion].resultCode = GlobalsConsts.RESULT_PLAYBOOK_RUN_ERROR,
   		    appStatusMapRef[appId + ":" + appVersion].lastChange = new Date().toISOString();

   		    appLogger.info("PlaybookGenerator.run, changing appStatus to: appStatus=" +
   		                   JSON.stringify(appStatusMapRef[appId + ":" + appVersion]));
                       persistence= new Persistence(appId, appVersion, JSON.stringify({}),JSON.stringify(appStatusMapRef[appId + ":" + appVersion]));
                       persistence.setAppdeploystatusDB(function (message) {
                         appLogger.info('setAppdeploystatusDB operation = ' + message);
                       });
   		   } 
   		  );
   		}
      appLogger.info("PlaybookGenerator.runOpenFirewallPlaybook.exit");
  }
   
  this.runNervePlaybook = function(type)
  {
	appLogger.info("PlaybookGenerator.runNervePlaybook.enter");
	
	var appId = manifestDataRef.manifest.app.id;
	var appVersion = manifestDataRef.manifest.app.version;

	nerveserviceFiles = NERVE_CONFIG_PATH + "/services/*.json";
	
	var ansiblePlaybook = new Ansible.Playbook().playbook(appId + "-nerve");
    var services = "";
    
	  if(type === "deploy")
	  {	  	
		  appLogger.info("runNervePlaybook = " + type)
		  
	  	 glob(nerveserviceFiles, function(err, files) {
	  			files.forEach(function(file) {
	  			var name = path.basename(file);
	  			if(name != "serviceConfigFiles.json")
	  				services = services  + " " + name;
		    try
		    {
			      fs.writeFileSync(NERVE_CONFIG_PATH + "/services/serviceConfigFiles.json", services);
			}
			catch (err)
			{
			  appLogger.error("Error writing serviceConfigFile for Nerve, err=" + err);
					      return callback(null, false);
			}	  			 
	  	 });	  		
	   });
	  }

    try
    {
      var command = "curl -s -o " + INVENTORY_FILENAME + " " + "http://dockerrepo/service-scripts/playbooks/inventory";
      content = execSync(command);
      appLogger.info("PlaybookGenerator wget inventory file ");
    }
    catch (err)
    {
      appLogger.error("PlaybookGenerator wget inventory file, err=" + err);
      throw GlobalsConsts.RESULT_FILE_NOT_FOUND;
    }  

    ansiblePlaybook.inventory(INVENTORY_FILENAME);
    ansiblePlaybook.variables(sshUser);
    ansiblePlaybook.variables(sshPass);

    var promise = ansiblePlaybook.exec({cwd:appPlaybooksPathRef});
    promise.then(
      function(successResult)
      {
    	  appLogger.info("PlaybookGenerator.runNervePlaybook, Nerve Playbook *****" + successResult.output);
        //update the status map
        appStatusMapRef[appId + ":" + appVersion].stateCode = GlobalsConsts.APP_STATE_COMPLETE_DEPLOY,
        appStatusMapRef[appId + ":" + appVersion].resultCode = GlobalsConsts.RESULT_OK,
        appStatusMapRef[appId + ":" + appVersion].lastChange = new Date().toISOString();

        appLogger.info("PlaybookGenerator.runNervePlaybook, changing appStatus to: appStatus=" +
                       JSON.stringify(appStatusMapRef[appId + ":" + appVersion]));
        persistence= new Persistence(appId, appVersion, JSON.stringify({}),JSON.stringify(appStatusMapRef[appId + ":" + appVersion]));
        persistence.setAppdeploystatusDB(function (message) {
          appLogger.info('setAppdeploystatusDB operation = ' + message);
        });

        appLogger.info("PlaybookGenerator.runNervePlaybook, successfully executed playbook=" + playbook +
                       ", successResult.code=" + successResult.code +
                       ", successResult.output=" + successResult.output);

      },

      function(err)
      {
        appLogger.error("PlaybookGenerator.runNervePlaybook, error executed playbook=" + nervePlaybookName +
                       ", err=" + err);

        appStatusMapRef[appId + ":" + appVersion].resultCode = GlobalsConsts.RESULT_PLAYBOOK_RUN_ERROR,
        appStatusMapRef[appId + ":" + appVersion].lastChange = new Date().toISOString();

        appLogger.info("PlaybookGenerator.runNervePlaybook, changing appStatus to: appStatus=" +
                       JSON.stringify(appStatusMapRef[appId + ":" + appVersion]));
        persistence= new Persistence(appId, appVersion, JSON.stringify({}),JSON.stringify(appStatusMapRef[appId + ":" + appVersion]));
        persistence.setAppdeploystatusDB(function (message) {
          appLogger.info('setAppdeploystatusDB operation = ' + message);
        });
      } 
    );
  }
    
}
