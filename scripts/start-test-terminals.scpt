#!/usr/bin/osascript
-- start-test-terminals.scpt
-- Opens two Terminal windows for David and Bob

tell application "Terminal"
    activate

    -- Bob terminal (wait for messages)
    set bobTab to do script "cd /Users/david/_projects/2_personal/projects/dodo-box && clear && echo '🦆 Bob 终端 - 输入用户名: bob, 密码: bbbb' && echo '' && pnpm cli"

    delay 0.5

    -- David terminal (send messages)
    set davidTab to do script "cd /Users/david/_projects/2_personal/projects/dodo-box && clear && echo '🦆 David 终端 - 输入用户名: david, 密码: dddd' && echo '' && pnpm cli"

    -- Set window titles
    set custom title of bobTab to "DodoBox - Bob"
    set custom title of davidTab to "DodoBox - David"
end tell

return "Terminals started"