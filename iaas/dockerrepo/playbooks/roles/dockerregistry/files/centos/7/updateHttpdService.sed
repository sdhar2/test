# SED commands to update the httpd.service file
/setupDockerRepoEnv.sh/d
/ExecStart=/ {
i\
ExecStartPre=/home/docker/setupDockerRepoEnv.sh
}
