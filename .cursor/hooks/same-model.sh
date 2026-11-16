#!/bin/bash
input=$(cat)
parent=$(echo "$input" | jq -r '.model // empty')
child=$(echo "$input" | jq -r '.subagent_model // empty')

if [ -n "$child" ] && [ "$child" != "$parent" ]; then
  jq -n --arg parent "$parent" --arg child "$child" '{
    permission: "deny",
    user_message: ("Blocked subagent model " + $child + ". Parent is " + $parent + ".")
  }'
  exit 0
fi

echo '{ "permission": "allow" }'
