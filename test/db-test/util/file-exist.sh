#!/bin/bash
trap 'kill $$' SIGINT

FILE=$1

if [[ ! -f "$FILE" ]]; then echo "false"
else echo "true"
fi