rule sinexis_php_eval_post
{
    meta:
        id = "sinexis.php.eval_post"
        hit_class = "webshell"
    strings:
        $a = "eval($_POST"
        $b = "eval($_GET"
        $c = "eval($_REQUEST"
    condition:
        any of them
}

rule sinexis_php_system_get
{
    meta:
        id = "sinexis.php.system_get"
        hit_class = "backdoor"
    strings:
        $a = "system($_GET"
        $b = "passthru($_GET"
        $c = "shell_exec($_GET"
    condition:
        any of them
}
