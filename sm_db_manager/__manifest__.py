# -*- coding: utf-8 -*-
{
    'name': 'Database Manager Menu',
    'version': '19.0.1.1.0',
    'summary': 'Quick access to Database Manager, backup with progress bar, and DB info from user menu',
    'description': 'Adds Database Manager shortcuts to the user dropdown menu with '
                   'role-based access control (User/Manager levels). Features include: '
                   'quick backup with animated progress bar, DB info panel (name, size, '
                   'last backup), copy DB name to clipboard, direct link to Database '
                   'Manager page, and backup history logging.',
    'category': 'Tools',
    'author': 'Steven Marp',
    'license': 'OPL-1',
    'depends': ['web'],
    'data': [
        'security/security.xml',
        'security/ir.model.access.csv',
    ],
    'assets': {
        'web.assets_backend': [
            'sm_db_manager/static/src/css/backup_progress.css',
            'sm_db_manager/static/src/js/db_info_component.js',
            'sm_db_manager/static/src/js/db_manager_menu.js',
            'sm_db_manager/static/src/xml/db_info_component.xml',
        ],
    },
    'images': ['static/description/banner.gif'],
    'installable': True,
    'auto_install': False,
    'application': False,
}
