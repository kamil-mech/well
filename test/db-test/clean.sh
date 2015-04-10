#!/bin/bash
trap 'kill $$' SIGINT
PREFIX="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

ARGS=$@
IFS=' ' read -ra ARGS <<< "$ARGS"
if [[ "$CFGFILE" == "" ]]; then export CFGFILE="$PWD/${ARGS[0]}"; fi
MOREARGS="${ARGS[1]}"
if [[ "$MOREARGS" == "" ]]; then
    ARGS=$npm_config_args
    IFS=' ' read -ra ARGS <<< "$ARGS"
fi

PROMPT=false
NER=false
AER=false
RCF=false
for VAR in "${ARGS[@]}"
do
    if [[ "$VAR" = "-prompt" ]]; then PROMPT=true; fi
    if [[ "$VAR" = "-ner" ]]; then NER=true; fi
    if [[ "$VAR" = "-aer" ]]; then AER=true; fi
    if [[ "$VAR" = "-rcf" ]]; then RCF=true; fi
done

if [[ "$NER" == false ]]; then
  echo
  echo "CLEANING AFTER DB TEST"
  echo "YOU CAN USE -ner FLAG TO NEVER ERASE"
  echo "OR -aer FLAG TO ERASE WITHOUT PROMPT (CAREFUL - CAN DESTROY HUMANITY!)"
  echo "IT IS ADVISED TO SET -aer FLAG AFTER SUCCESSFUL RUN WITHOUT IT"
  echo
  
  echo "ORPHANED DOCKER VOLUMES TAKE ENORMOUS AMOUNTS OF SPACE"
  CONFIRM=false
  if [[ "$AER" == false ]]; then
    bash $PREFIX/util/confirm.sh "ERASE DOCKER BLOAT AT /var/lib/docker/vfs/dir ?"
    CONFIRM=$(bash $PREFIX/util/read-inspect.sh confirm)
  fi
  if [[ "$CONFIRM" = true || "$AER" == true ]]; then
    echo "ERASING DOCKER BLOAT AT /var/lib/docker/vfs/dir"
    sudo rm -rf /var/lib/docker/vfs/dir
  fi

  WORKDIR=$(bash $PREFIX/util/conf-obtain.sh app workdir)
  CFILES=$(bash $PREFIX/util/conf-obtain.sh cleanups -a)
  CNO=$(bash $PREFIX/util/split.sh "$CFILES" "@" 0)
  if [[ "$CNO" != "" && "$CNO" > 0 ]]; then
    for (( I=1; I<=CNO; I++ ))
    do
      CFILE=$(bash $PREFIX/util/split.sh "$CFILES" "@" $I)
      CFILE=$(echo $CFILE | xargs) # trims whitespace
      if [[ "$CFILE" == "." || "$CFILE" == *".."* 
         || "$CFILE" == *".git"* || "$WORKDIR/$CFILE" == "$WORKDIR"
         || "$WORKDIR/$CFILE" == *"$PREFIX"* || "$PREFIX" == *"$WORKDIR/$CFILE"* ]]; then
        echo "[DANGEROUS SYNTAX] REFUSE TO DELETE $CFILE"
        continue
      fi

      CONFIRM=false
      if [[ "$AER" == false ]]; then
        bash $PREFIX/util/confirm.sh "ERASE $WORKDIR/$CFILE ?"
        CONFIRM=$(bash $PREFIX/util/read-inspect.sh confirm)
      fi
      if [[ "$CONFIRM" = true || "$AER" == true ]]; then
        echo "ERASING $WORKDIR/$CFILE"
        sudo rm -rf $WORKDIR/$CFILE
      fi
    done
  fi
else
  echo
  echo "OMIT TEMP FILE ERASE"
  echo
fi

bash $PREFIX/util/kill-containers.sh
bash $PREFIX/util/kill-other-gnome.sh

if [[ "$PROMPT" = true ]]; then
    echo
    echo "NOTE: IT IS SAFE TO [CTRL]+[C] NOW"
    echo "ALL CLEAR. TAP [ENTER] KEY TO CONTINUE"
    read
fi
echo