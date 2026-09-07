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

rule sinexis_php_adminer
{
    meta:
        id = "sinexis.php.adminer"
        hit_class = "adminer"
    strings:
        $a = "Software: Adminer"
        $b = "www.adminer.org"
    condition:
        any of them
}

rule sinexis_php_filesman
{
    meta:
        id = "sinexis.php.filesman"
        hit_class = "webshell"
    strings:
        $a = "FilesMan"
        $b = "c99shell"
    condition:
        any of them
}

rule sinexis_php_http_dropper
{
    meta:
        id = "sinexis.php.http_dropper"
        hit_class = "dropper"
    strings:
        $a = "file_get_contents(\"http"
        $b = "file_get_contents('http"
        $c = "wget $_GET"
        $d = "curl_exec($_GET"
    condition:
        any of them
}
