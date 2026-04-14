# -*- coding: utf-8 -*-
import logging

import odoo
from odoo import fields, http
from odoo.http import content_disposition, request
from werkzeug.wrappers import Response

_logger = logging.getLogger(__name__)


class SmDbManagerController(http.Controller):

    @http.route('/sm_db_manager/backup', type='http', auth='user', methods=['POST'], csrf=False)
    def backup_database(self, backup_format='zip', backup_token='', **kwargs):
        if not request.env.user.has_group('sm_db_manager.group_db_manager_manager'):
            raise request.not_found()

        db_name = request.db
        ts = fields.Datetime.now().strftime('%Y-%m-%d_%H-%M-%S')
        filename = f"{db_name}_{ts}.{backup_format}"

        # Get DB size for logging
        db_size_human = 'N/A'
        try:
            request.env.cr.execute("SELECT pg_database_size(current_database())")
            db_size_bytes = request.env.cr.fetchone()[0]
            db_size_human = self._format_size(db_size_bytes)
        except Exception:
            pass

        # Log the backup
        request.env['sm.db.backup.log'].sudo().create({
            'name': filename,
            'backup_format': backup_format,
            'user_id': request.env.user.id,
            'db_size': db_size_human,
        })

        # Dump database — exact same approach as Odoo's /web/database/backup
        _logger.info("Quick backup triggered by %s for database %s", request.env.user.login, db_name)
        dump_stream = odoo.service.db.dump_db(db_name, None, backup_format)

        headers = [
            ('Content-Type', 'application/octet-stream; charset=binary'),
            ('Content-Disposition', content_disposition(filename)),
        ]
        response = Response(dump_stream, headers=headers, direct_passthrough=True)

        # Set completion cookie so JS can detect backup is done
        if backup_token:
            response.set_cookie('sm_backup_token', backup_token, max_age=60, path='/')

        return response

    @http.route('/sm_db_manager/db_info', type='jsonrpc', auth='user')
    def get_db_info(self):
        if not request.env.user.has_group('sm_db_manager.group_db_manager_user'):
            return {'error': 'Access Denied'}

        db_name = request.db

        # Get DB size
        try:
            request.env.cr.execute("SELECT pg_database_size(current_database())")
            db_size_bytes = request.env.cr.fetchone()[0]
            db_size_human = self._format_size(db_size_bytes)
        except Exception:
            db_size_bytes = 0
            db_size_human = 'N/A'

        # Get last backup
        last_backup = request.env['sm.db.backup.log'].sudo().search(
            [], limit=1, order='create_date desc'
        )

        return {
            'db_name': db_name,
            'db_size': db_size_bytes,
            'db_size_human': db_size_human,
            'last_backup': last_backup.create_date.isoformat() if last_backup else False,
            'last_backup_user': last_backup.user_id.name if last_backup else False,
        }

    @staticmethod
    def _format_size(size_bytes):
        for unit in ['B', 'KB', 'MB', 'GB', 'TB']:
            if size_bytes < 1024:
                return f"{size_bytes:.1f} {unit}"
            size_bytes /= 1024
        return f"{size_bytes:.1f} PB"
