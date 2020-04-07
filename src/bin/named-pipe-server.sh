# for testing / debugging (does not test .in and .out)

pipe=/tmp/testpipe

trap "rm -f $pipe" EXIT

if [[ ! -p $pipe ]]; then
    mkfifo $pipe
fi

echo Using $pipe as named pipe

while true
do
    if read line <$pipe; then
        if [[ "$line" == 'exit' ]]; then
            break
        fi
        echo read $line
    fi
done

echo "Reader exiting"
