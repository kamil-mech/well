PREFIX="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
DB=$1

echo RUN $DB

BASE="docker run --rm"
IFS='-' read -ra IN <<< "$DB"
DBTRIM="${IN[0]}"

if [ "$DB" = "mongo-store" ]; then
    BASE="$BASE -p 27017:27017 -p 28017:28017"
    ARGS="--httpinterface"
elif  [ "$DB" = "postgres-store" ]; then
    BASE="bash $PREFIX/dbs/postgres-init.sh"
fi

BASE="$BASE --name $DBTRIM-inst $DBTRIM $ARGS"
echo "$BASE"
echo
bash -c "$BASE"

read -p "DB IS DONE" -n 1 -s
echo 