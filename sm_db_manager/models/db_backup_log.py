# -*- coding: utf-8 -*-
from odoo import models, fields


class SmDbBackupLog(models.Model):
    _name = 'sm.db.backup.log'
    _description = 'Database Backup Log'
    _order = 'create_date desc'

    name = fields.Char(string='Filename', required=True)
    backup_format = fields.Selection([
        ('zip', 'ZIP (with filestore)'),
        ('dump', 'PostgreSQL Dump'),
    ], string='Format', default='zip', required=True)
    user_id = fields.Many2one('res.users', string='Triggered By', required=True)
    db_size = fields.Char(string='DB Size at Backup')
