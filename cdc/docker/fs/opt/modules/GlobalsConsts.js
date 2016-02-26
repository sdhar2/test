/**
 * Copyright 2015 ARRIS Enterprises, Inc. All rights reserved.
 * This program is confidential and proprietary to ARRIS Enterprises, Inc. (ARRIS),
 * and may not be copied, reproduced, modified, disclosed to others, published or used,
 * in whole or in part, without the express prior written permission of ARRIS.
 */

/**
 * This module defines all the global consts 
 */

/**
 * Constants
 */

exports.DEPLOY_FILEPATH = "/opt/code_controller/deploy";

exports.RESULT_OK = {code: 0, text: "OK"};
exports.RESULT_PENDING = {code: 1, text: "PENDING"};
exports.RESULT_FILE_NOT_FOUND = {code: 2, text: "FILE_NOT_FOUND"};
exports.RESULT_MANIFEST_PARSE_ERROR = {code: 3, text: "MANIFEST_PARSE_ERROR"};
exports.RESULT_MANIFEST_CONFIG_ERROR = {code: 4, text: "MANIFEST_CONFIG_ERROR"};
exports.RESULT_FILE_UNZIP_ERROR = {code: 5, text: "FILE_UNZIP_ERROR"};
exports.RESULT_IMAGE_FILE_FORMAT_ERROR = {code: 6, text: "IMAGE_FILE_FORMAT_ERROR"};
exports.RESULT_IMAGE_LOAD_ERROR = {code: 7, text: "IMAGE_LOAD_ERROR"};
exports.RESULT_IMAGE_TAG_ERROR = {code: 8, text: "IMAGE_TAG_ERROR"};
exports.RESULT_IMAGE_PUSH_ERROR = {code: 9, text: "IMAGE_PUSH_ERROR"};
exports.RESULT_IMAGE_PULL_ERROR = {code: 10, text: "IMAGE_PULL_ERROR"};
exports.RESULT_GEN_COMPOSE_FILE_ERROR = {code: 11, text: "COMPOSE_FILE_GENERATION_ERROR"};
exports.RESULT_GEN_PLAYBOOK_FILE_ERROR = {code: 12, text: "PLAYBOOK_FILE_GENERATION_ERROR"};
exports.RESULT_GEN_NERVE_CONFIG_ERROR = {code: 13, text: "NERVE_CONFIG_GENERATION_ERROR"};
exports.RESULT_GEN_SYNAPSE_CONFIG_ERROR = {code: 14, text: "SYNAPSE_CONFIG_GENERATION_ERROR"};
exports.RESULT_PLAYBOOK_RUN_ERROR = {code: 15, text: "PLAYBOOK_RUN_ERROR"};
exports.RESULT_SWARM_INFO_ERROR = {code: 16, text: "SWARM_INFO_ERROR"};
exports.RESULT_FILE_REMOVE_ERROR = {code: 17, text: "FILE_REMOVE_ERROR"};
exports.RESULT_UNDEPLOY_ERROR = {code: 18, text: "UNDEPLOY_ERROR"};
exports.RESULT_DEPLOY_ERROR = {code: 19, text: "DEPLOY_ERROR"};
exports.RESULT_SCALE_ERROR = {code: 20, text: "SCALE_ERROR"};
exports.RESULT_IMAGE_REMOVE_ERROR = {code: 21, text: "IMAGE_REMOVE_ERROR"};
exports.RESULT_DBAAS_CONNECTION_ERROR = {code: 22, text: "DBAAS_CONNECTION_ERROR"};

exports.APP_STATE_START_INSTALL = {code: 0, text: "START_INSTALL"};
exports.APP_STATE_PROCESS_RELEASEFILE = {code: 1, text: "PROCESS_RELEASE_FILE"};
exports.APP_STATE_LOAD_IMAGE = {code: 2, text: "LOAD_IMAGE"};
exports.APP_STATE_COMPLETE_INSTALL = {code: 3, text: "COMPLETE_INSTALL"};

exports.APP_STATE_START_UNINSTALL = {code: 4, text: "START_UNINSTALL"};
exports.APP_STATE_UNLOAD_IMAGE  = {code: 5, text: "REMOVE IMAGE"};
exports.APP_STATE_COMPLETE_UNINSTALL = {code: 6, text: "COMPLETE_UNINSTALL"};

exports.APP_STATE_START_DEPLOY = {code: 10, text: "START_DEPLOY"};
exports.APP_STATE_GEN_PLAYBOOK = {code: 11, text: "GENERATE_PLAYBOOK_FILES"};
exports.APP_STATE_RUN_PLAYBOOK = {code: 12, text: "RUN_PLAYBOOK"}; 
exports.APP_STATE_COMPLETE_DEPLOY = {code: 13, text: "COMPLETE_DEPLOY"};

exports.APP_STATE_START_UNDEPLOY = {code: 14, text: "START_UNDEPLOY"};
exports.APP_STATE_RUN_UNDEPLOY_PLAYBOOK = {code: 15, text: "RUN_UNDEPLOY_PLAYBOOK"};
exports.APP_STATE_COMPLETE_UNDEPLOY = {code: 16, text: "COMPLETE_UNDEPLOY"};

exports.APP_STATE_START_SCALE = {code: 17, text: "START_SCALE"};
exports.APP_STATE_RUN_SCALE_PLAYBOOK = {code: 18, text: "RUN_SCALE_PLAYBOOK"};
exports.APP_STATE_COMPLETE_SCALE = {code: 19, text: "COMPLETE_SCALE"};

exports.TASK_TYPE_INSTALL = {code: 0, text: "INSTALL"};
exports.TASK_TYPE_DEPLOY = {code: 1, text: "DEPLOY"};
exports.TASK_TYPE_UNINSTALL = {code: 2, text: "UNINSTALL"};
exports.TASK_TYPE_UNDEPLOY = {code: 3, text: "UNDEPLOY"};
