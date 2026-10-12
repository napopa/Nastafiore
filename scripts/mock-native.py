import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        path = urlparse(self.path).path
        if path.endswith('/system/status'):
            data = {'version': '3.1.6-native-mock'}
        elif path.endswith('/rootfolder'):
            data = [{'path': '/music', 'defaultQualityProfileId': 1, 'defaultMetadataProfileId': 2}]
        elif path.endswith('/qualityprofile'):
            data = [{'id': 1, 'name': 'Lossless'}]
        elif path.endswith('/metadataprofile'):
            data = [{'id': 2, 'name': 'Standard'}]
        elif path.startswith('/lidarr/'):
            data = []
        else:
            data = {'subsonic-response': {'status': 'ok', 'version': '1.16.1', 'type': 'navidrome', 'serverVersion': 'native-mock', 'searchResult3': {}, 'starred2': {'artist': [], 'album': [], 'song': []}, 'albumList2': {'album': []}, 'playlists': {'playlist': []}, 'artistInfo2': {}, 'scanStatus': {'scanning': False}}}
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())

    def do_POST(self):
        self.send_error(403, 'Native validation never permits acquisitions')

    do_PUT = do_POST
    do_DELETE = do_POST


ThreadingHTTPServer(('127.0.0.1', 8782), Handler).serve_forever()
