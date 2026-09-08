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

rule sinexis_php_assert_input
{
    meta:
        id = "sinexis.php.assert_input"
        hit_class = "webshell"
    strings:
        $a = "assert($_POST"
        $b = "assert($_GET"
        $c = "assert($_REQUEST"
    condition:
        any of them
}

rule sinexis_php_preg_replace_e
{
    meta:
        id = "sinexis.php.preg_replace_e"
        hit_class = "webshell"
    strings:
        $a = "preg_replace('/.*/e"
        $b = "preg_replace(\"/.*/e"
    condition:
        any of them
}

rule sinexis_php_create_function
{
    meta:
        id = "sinexis.php.create_function"
        hit_class = "webshell"
    strings:
        $a = "create_function($_POST"
        $b = "create_function($_GET"
        $c = "create_function($_REQUEST"
    condition:
        any of them
}

rule sinexis_php_eval_b64
{
    meta:
        id = "sinexis.php.eval_b64"
        hit_class = "webshell"
    strings:
        $a = "eval(base64_decode"
        $b = "eval(gzinflate"
        $c = "eval(str_rot13"
    condition:
        any of them
}

rule sinexis_php_gzinflate_b64
{
    meta:
        id = "sinexis.php.gzinflate_b64"
        hit_class = "webshell"
    strings:
        $a = "gzinflate(base64_decode"
        $b = "gzuncompress(base64_decode"
        $c = "gzdecode(base64_decode"
    condition:
        any of them
}

rule sinexis_php_str_rot13_input
{
    meta:
        id = "sinexis.php.str_rot13_input"
        hit_class = "webshell"
    strings:
        $a = "str_rot13($_POST"
        $b = "str_rot13($_GET"
        $c = "str_rot13($_REQUEST"
    condition:
        any of them
}

rule sinexis_php_include_http
{
    meta:
        id = "sinexis.php.include_http"
        hit_class = "dropper"
    strings:
        $a = "include(\"http"
        $b = "include('http"
        $c = "require(\"http"
        $d = "require('http"
        $e = "include_once(\"http"
        $f = "require_once(\"http"
    condition:
        any of them
}

rule sinexis_php_backtick_input
{
    meta:
        id = "sinexis.php.backtick_input"
        hit_class = "backdoor"
    strings:
        $a = "`$_POST"
        $b = "`$_GET"
        $c = "`$_REQUEST"
    condition:
        any of them
}

rule sinexis_php_proc_open_input
{
    meta:
        id = "sinexis.php.proc_open_input"
        hit_class = "backdoor"
    strings:
        $a = "proc_open($_POST"
        $b = "proc_open($_GET"
        $c = "proc_open($_REQUEST"
        $d = "popen($_GET"
        $e = "popen($_POST"
    condition:
        any of them
}

rule sinexis_php_exec_input
{
    meta:
        id = "sinexis.php.exec_input"
        hit_class = "backdoor"
    strings:
        $a = "exec($_POST"
        $b = "exec($_GET"
        $c = "exec($_REQUEST"
    condition:
        any of them
}

rule sinexis_php_system_post
{
    meta:
        id = "sinexis.php.system_post"
        hit_class = "backdoor"
    strings:
        $a = "system($_POST"
        $b = "passthru($_POST"
        $c = "shell_exec($_POST"
        $d = "system($_REQUEST"
        $e = "passthru($_REQUEST"
        $f = "shell_exec($_REQUEST"
    condition:
        any of them
}

rule sinexis_php_unserialize_input
{
    meta:
        id = "sinexis.php.unserialize_input"
        hit_class = "webshell"
    strings:
        $a = "unserialize($_POST"
        $b = "unserialize($_GET"
        $c = "unserialize($_REQUEST"
    condition:
        any of them
}

rule sinexis_php_file_put_input
{
    meta:
        id = "sinexis.php.file_put_input"
        hit_class = "dropper"
    strings:
        $a = "file_put_contents($_POST"
        $b = "file_put_contents($_GET"
        $c = "file_put_contents($_REQUEST"
        $d = "fwrite($_POST"
        $e = "fwrite($_GET"
    condition:
        any of them
}

rule sinexis_php_move_uploaded
{
    meta:
        id = "sinexis.php.move_uploaded"
        hit_class = "dropper"
    strings:
        $a = "move_uploaded_file($_FILES"
        $b = "copy($_FILES"
    condition:
        any of them
}

rule sinexis_php_eval_files
{
    meta:
        id = "sinexis.php.eval_files"
        hit_class = "webshell"
    strings:
        $a = "eval($_FILES"
        $b = "include($_FILES"
        $c = "require($_FILES"
    condition:
        any of them
}
