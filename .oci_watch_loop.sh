#!/bin/zsh
set -u
cd /Users/Aleksandr_Omelenetskiy/Projects/Tesla/TeslaApp || exit 1
log=/tmp/oci_grub_watch.log
: > "$log"
end=$(( $(date +%s) + 300 ))
while [ $(date +%s) -lt $end ]; do
  {
    echo "=== ATTEMPT $(date -u '+%Y-%m-%dT%H:%M:%SZ') ==="
    expect ./.oci_grub_watch.exp
    echo "RC:$?"
  } >> "$log" 2>&1
  sleep 1
done
cat "$log"

