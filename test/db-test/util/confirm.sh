#!/bin/bash
trap 'kill $$' SIGINT
PREFIX="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

MSG=$1

echo "$MSG (y/n)"
read
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then echo "true" > $PREFIX/temp.confirm.out
else echo "false" > $PREFIX/temp.confirm.out
fi
