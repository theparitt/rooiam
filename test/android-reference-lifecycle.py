#!/usr/bin/env python3
"""Physical reference-app recovery checks using only disposable public intents.

Requires an unlocked, already enrolled debug reference app on the local walkthrough.
Does not install, clear app data, read vault/cookies, approve a login, or revoke a phone.
Uses Paste QR for repeatability; camera/operator acceptance is separate.
"""
import json
import http.client
import http.server
import os
import re
import shlex
import subprocess
import time
import threading
import urllib.request
import uuid
import xml.etree.ElementTree as ET

ADB = os.environ.get('ROOIAM_TEST_ADB', 'adb')
SERIAL = os.environ['ANDROID_SERIAL']
PORT = os.environ.get('ROOIAM_TEST_ADB_PORT', '5037')
ORIGIN = 'http://127.0.0.1:15470'
PACKAGE = 'com.rooiam.mobile'


def adb(*args):
    return subprocess.run([ADB, '-P', PORT, '-s', SERIAL, *args], check=True,
                          capture_output=True, text=True, timeout=30).stdout


def ui():
    for attempt in range(3):
        try:
            adb('shell', 'rm -f /sdcard/rooiam-lifecycle-window.xml')
            adb('shell', 'uiautomator dump /sdcard/rooiam-lifecycle-window.xml')
            text = adb('shell', 'cat /sdcard/rooiam-lifecycle-window.xml')
            return ET.fromstring(text[text.index('<?xml'):])
        except (subprocess.CalledProcessError, ValueError, ET.ParseError):
            if attempt == 2:
                raise
            time.sleep(0.5)


def wait_text(expected, present=True):
    for _ in range(8):
        root = ui()
        found = any(expected.lower() in n.get('text', '').lower() for n in root.iter('node'))
        if found == present:
            return root
        time.sleep(0.3)
    raise AssertionError(f'UI condition failed: {expected!r} present={present}')


def tap(label):
    for n in ui().iter('node'):
        if n.get('text', '').lower() == label.lower():
            x1, y1, x2, y2 = map(int, re.findall(r'\d+', n.get('bounds')))
            adb('shell', f'input tap {(x1+x2)//2} {(y1+y2)//2}')
            return
    raise AssertionError(f'Button missing: {label}')


def post(path, body):
    request = urllib.request.Request(ORIGIN + '/v1' + path,
        data=json.dumps(body).encode(), headers={'Content-Type': 'application/json', 'User-Agent': 'RooiamPhysicalLifecycle'})
    with urllib.request.urlopen(request, timeout=20) as response:
        return json.load(response)


def status(intent):
    request = urllib.request.Request(ORIGIN + '/v1/auth/device-login/' + intent['public_id']
        + '/status?browser_nonce=' + intent['browser_nonce'], headers={'User-Agent': 'RooiamPhysicalLifecycle'})
    with urllib.request.urlopen(request, timeout=20) as response:
        return json.load(response)['status']


def start():
    return post('/auth/device-login/start', {'surface': 'tenant', 'redirect_uri': 'http://127.0.0.1:15472/my'})


def cancel(intent):
    post('/auth/device-login/cancel', {k: intent[k] for k in ('public_id', 'browser_nonce')})


def reopen(kill=False):
    adb('shell', 'input keyevent KEYCODE_HOME')
    if kill:
        adb('shell', 'am force-stop ' + PACKAGE)
    adb('shell', 'am start -n ' + PACKAGE + '/.MainActivity')


def paste(intent):
    tap('Paste QR text')
    root = wait_text('Sign-in request')
    fields = [n for n in root.iter('node') if n.get('class') == 'android.widget.EditText']
    assert fields, 'QR input missing'
    x1, y1, x2, y2 = map(int, re.findall(r'\d+', fields[-1].get('bounds')))
    adb('shell', f'input tap {(x1+x2)//2} {(y1+y2)//2}')
    # Only a public origin + request ID; no nonce, cookie or signing material.
    qr = 'rooiam://device-login?server=http%3A%2F%2F127.0.0.1%3A15470&public_id=' + intent['public_id']
    adb('shell', 'input text ' + shlex.quote(qr))
    assert any(n.get('text') == qr for n in ui().iter('node')), 'QR input was not entered intact'
    tap('Preview')
    wait_text('Approve this browser?')


try:
    reopen(kill=True)
    wait_text(ORIGIN)
    tap('3. Scan a sign-in QR')
    wait_text('Cancel scan')
    reopen()
    wait_text('Cancel scan')
    reopen(kill=True)
    wait_text('Paste QR text')
    print('PASS scanner background/return and process restart to safe home', flush=True)

    intent = start()
    paste(intent)
    # Recreate the activity through a real configuration change, restoring the
    # owner's rotation preferences even when the assertion fails.
    rotation = {key: adb('shell', 'settings get system ' + key).strip()
                for key in ('accelerometer_rotation', 'user_rotation')}
    try:
        adb('shell', 'settings put system accelerometer_rotation 0')
        current = int(ui().get('rotation', '0'))
        target = (current + 1) % 4
        adb('shell', 'settings put system user_rotation ' + str(target))
        root = wait_text('Approve this browser?')
        assert int(root.get('rotation', '-1')) == target, 'Rotation did not apply'
    finally:
        for key, value in rotation.items():
            adb('shell', 'settings ' + ('delete system ' + key if value == 'null' else 'put system ' + key + ' ' + value))
    wait_text('Approve this browser?')
    print('PASS review survives orientation/activity recreation without a decision', flush=True)
    reopen()
    wait_text('Approve this browser?')
    cancel(intent)
    reopen()
    wait_text('This request is unavailable')
    wait_text('Approve this browser?', present=False)
    reopen(kill=True)
    wait_text('Approve this browser?', present=False)
    print('PASS pending review refresh; cancellation blocks restored review after return/restart', flush=True)

    intent = start()
    paste(intent)
    public_id = str(uuid.UUID(intent['public_id']))
    subprocess.run(['psql', 'postgres://postgres:rooiam-local-test@127.0.0.1:15440/rooiam_test',
                    '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-c',
                    "UPDATE device_login_intents SET expires_at=NOW()-INTERVAL '1 second' "
                    f"WHERE public_id='{public_id}' AND requester_user_agent='RooiamPhysicalLifecycle'"], check=True, capture_output=True)
    reopen(kill=True)
    wait_text('This request is unavailable')
    wait_text('Approve this browser?', present=False)
    print('PASS expired request rejected on physical process restoration', flush=True)

    intent = start()
    paste(intent)
    adb('shell', 'input keyevent KEYCODE_HOME')
    adb('shell', 'am force-stop ' + PACKAGE)
    adb('reverse', '--remove', 'tcp:15470')
    adb('shell', 'am start -n ' + PACKAGE + '/.MainActivity')
    wait_text('Cannot reach your server')
    wait_text('Approve this browser?', present=False)
    adb('reverse', 'tcp:15470', 'tcp:15470')
    reopen()
    wait_text('Approve this browser?')
    tap('Close')
    cancel(intent)
    reopen(kill=True)
    wait_text('Approve this browser?', present=False)
    print('PASS offline process recovery, reconnect/fresh review and explicit close persistence', flush=True)

    # A real device mutation whose response is deliberately lost. Deny only:
    # the runner never grants a browser session or substitutes for user approval.
    counts = {'rejections': 0, 'requests': []}

    class DropDecisionResponse(http.server.BaseHTTPRequestHandler):
        protocol_version = 'HTTP/1.1'
        def log_message(self, *args):
            pass  # Never log cookies or bodies.

        def forward(self):
            counts['requests'].append(self.command + ' ' + self.path)
            body = self.rfile.read(int(self.headers.get('Content-Length', '0')))
            connection = http.client.HTTPConnection('127.0.0.1', 15470, timeout=20)
            try:
                headers = dict(self.headers)
                headers['Connection'] = 'close'
                connection.request(self.command, self.path, body=body, headers=headers)
                response = connection.getresponse()
                data = response.read()
                if self.path == '/v1/identity/device-login/reject':
                    assert response.status == 200
                    counts['rejections'] += 1
                    self.close_connection = True
                    return
                self.send_response(response.status)
                for key, value in response.getheaders():
                    if key.lower() not in ('transfer-encoding', 'connection', 'content-length'):
                        self.send_header(key, value)
                self.send_header('Content-Length', str(len(data)))
                self.send_header('Connection', 'close')
                self.end_headers()
                self.wfile.write(data)
                self.close_connection = True
            finally:
                connection.close()

        do_GET = forward
        do_POST = forward

    proxy = http.server.ThreadingHTTPServer(('127.0.0.1', 15477), DropDecisionResponse)
    thread = threading.Thread(target=proxy.serve_forever, daemon=True)
    thread.start()
    try:
        intent = start()
        adb('reverse', 'tcp:15470', 'tcp:15477')
        reopen(kill=True)
        paste(intent)
        tap('Deny')
        wait_text('The last decision may have reached the server')
        assert status(intent) == 'rejected', str(counts)
        reopen(kill=True)
        wait_text('The last decision may have reached the server')
        assert counts['rejections'] == 1, 'Decision replayed after response loss/restart'
        print('PASS physical SDK lost decision response: one rejection, persistent recovery message, no resend after restart', flush=True)
    finally:
        adb('reverse', 'tcp:15470', 'tcp:15470')
        proxy.shutdown()
        proxy.server_close()

    reopen(kill=True)
    intent = start()
    paste(intent)
    tap('Deny')
    wait_text('Request denied.')
    reopen(kill=True)
    wait_text('The last decision may have reached the server', present=False)
    print('PASS successful explicit decision clears interrupted-decision warning', flush=True)
finally:
    adb('reverse', 'tcp:15470', 'tcp:15470')
    adb('shell', 'rm -f /sdcard/rooiam-lifecycle-window.xml')
