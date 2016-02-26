#!/bin/bash
#resize disk ...
#
mount_type_xfs=`df -T / | grep xfs | wc -l`
mount_type_ext4=`df -T / | grep ext4 | wc -l`
mount_type_ext3=`df -T / | grep ext3 | wc -l`
mount_name=`df -T / | head -2 | tail -1 | cut -f1 -d" "`
#part_name=`df -T / | head -2 | tail -1 | cut -f1 -d" " | cut -f3 -d"/"`
part_name=`vgscan | grep "Found volume group" | cut -f2 -d"\""`
echo ${mount_name}
echo ${part_name}
if [[ ${mount_type_xfs} == 1 ]]; then
echo "XFS"

part_cnt=`sudo file -sL /dev/sda3 | grep "/dev/sda3: cannot open (No such file or directory)"|wc -l`
if [[ ${part_cnt} -gt 0 ]];then
echo "d
3
n
p
3



w
"| fdisk /dev/xvda > /dev/null 2>&1
echo "d
3
n
p
3



w
"| fdisk /dev/sda > /dev/null 2>&1
else
echo "n
p
3



w
"| fdisk /dev/xvda > /dev/null 2>&1
echo "n
p
3



w
"| fdisk /dev/sda > /dev/null 2>&1
fi

partprobe /dev/xvda > /dev/null 2>&1
xfs_growfs /dev/xvda3 > /dev/null 2>&1
partprobe /dev/sda > /dev/null 2>&1
xfs_growfs /dev/sda3 > /dev/null 2>&1
fi

if [[ ${mount_type_ext4} == 1 || ${mount_type_ext3} == 1 ]]; then
echo "EXT"
echo "n
p
3


t
3
8e
w
"| fdisk /dev/sda > /dev/null
partx -v -a /dev/sda > /dev/null
pvcreate /dev/sda3 > /dev/null
vgextend ${part_name} /dev/sda3 > /dev/null
lvextend -l +100%FREE ${mount_name} > /dev/null
resize2fs ${mount_name}
fi

