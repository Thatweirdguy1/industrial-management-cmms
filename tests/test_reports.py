import io
import os
import tempfile
import unittest


_temp_dir = tempfile.TemporaryDirectory()
_database_path = os.path.join(_temp_dir.name, 'test.db')
os.environ['CMMS_DATABASE_PATH'] = _database_path
os.environ['CMMS_UPLOAD_FOLDER'] = os.path.join(_temp_dir.name, 'uploads')
os.environ['DATABASE_URL'] = f'sqlite:///{_database_path}'
os.environ['CMMS_ENABLE_SCHEDULER'] = 'false'
for _key in ('AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_BUCKET_NAME'):
    os.environ.pop(_key, None)

import app as app_module
from models import Machine, db


class ReportApiTests(unittest.TestCase):
    @classmethod
    def tearDownClass(cls):
        with app_module.app.app_context():
            db.session.remove()
            db.engine.dispose()
        _temp_dir.cleanup()

    def setUp(self):
        app_module.app.config.update(TESTING=True)
        self.app_context = app_module.app.app_context()
        self.app_context.push()
        db.session.rollback()
        db.session.query(Machine).delete()
        db.session.commit()
        connection = app_module.get_db_connection()
        connection.execute('DELETE FROM machine_reports')
        connection.commit()
        connection.close()
        db.session.add(Machine(id=1, name='Test Press', location='Test Bay', status='operational'))
        db.session.commit()
        self.client = app_module.app.test_client()

    def tearDown(self):
        db.session.remove()
        self.app_context.pop()

    def test_report_upload_accepts_mobile_mime_without_filename_extension(self):
        response = self.client.post(
            '/api/reports',
            data={
                'machine_id': '1',
                'engineer_type': 'internal',
                'engineer_name': 'Mobile Engineer',
                'notes': 'Uploaded from a document provider',
                'file': (io.BytesIO(b'%PDF-1.4\n%%EOF'), 'inspection', 'application/pdf'),
            },
            content_type='multipart/form-data',
        )
        self.assertEqual(response.status_code, 201, response.get_json())
        self.assertTrue(response.get_json()['report']['file_url'].endswith('.pdf'))

        all_reports = self.client.get('/api/reports').get_json()
        self.assertEqual(len(all_reports), 1)
        self.assertEqual(all_reports[0]['formatted_id'], '001')

        machine_reports = self.client.get('/api/machines/1/reports').get_json()
        self.assertEqual(len(machine_reports), 1)
        self.assertEqual(machine_reports[0]['engineer_name'], 'Mobile Engineer')

    def test_report_upload_rejects_unknown_machine(self):
        response = self.client.post(
            '/api/reports',
            data={
                'machine_id': '999',
                'engineer_type': 'external',
                'engineer_name': 'Vendor',
            },
        )
        self.assertEqual(response.status_code, 404)

    def test_report_upload_accepts_extensionless_ios_heic(self):
        response = self.client.post(
            '/api/reports',
            data={
                'machine_id': '1',
                'engineer_type': 'external',
                'engineer_name': 'iOS Engineer',
                'file': (io.BytesIO(b'heic-test-payload'), 'camera-upload', 'image/heic'),
            },
            content_type='multipart/form-data',
        )
        self.assertEqual(response.status_code, 201, response.get_json())
        self.assertTrue(response.get_json()['report']['file_url'].endswith('.heic'))

    def test_report_upload_rejects_unsupported_attachment(self):
        response = self.client.post(
            '/api/reports',
            data={
                'machine_id': '1',
                'engineer_type': 'internal',
                'engineer_name': 'Engineer',
                'file': (io.BytesIO(b'not supported'), 'payload.exe', 'application/octet-stream'),
            },
            content_type='multipart/form-data',
        )
        self.assertEqual(response.status_code, 415)

    def test_frontend_api_contract_routes_are_registered(self):
        registered = {
            (rule.rule, method)
            for rule in app_module.app.url_map.iter_rules()
            for method in rule.methods
        }
        expected = {
            ('/api/reports', 'GET'),
            ('/api/reports', 'POST'),
            ('/api/reports/monthly-pm/download', 'GET'),
            ('/api/work-orders/preventive', 'POST'),
            ('/api/work-orders/<int:order_id>/photos', 'POST'),
            ('/api/machines/<int:machine_id>/parts', 'GET'),
            ('/api/machines/<int:machine_id>/parts', 'POST'),
            ('/api/parts/<int:part_id>', 'PUT'),
            ('/api/analytics', 'GET'),
        }
        self.assertTrue(expected.issubset(registered), expected - registered)


if __name__ == '__main__':
    unittest.main()
