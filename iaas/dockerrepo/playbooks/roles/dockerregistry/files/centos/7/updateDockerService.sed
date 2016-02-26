# SED commands to update the docker.service file
/After.*httpd.service/ ! {
/After/s/$/ httpd.service/
}
/startDockerRegistry/d
/ExecStart=/ {
a\
ExecStartPost=-/home/docker/startDockerRegistry-2.1
}
