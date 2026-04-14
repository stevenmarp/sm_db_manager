/** @odoo-module **/
import { registry } from "@web/core/registry";
import { browser } from "@web/core/browser/browser";
import { _t } from "@web/core/l10n/translation";
import { session } from "@web/session";

const userMenuRegistry = registry.category("user_menuitems");

// ── Progress overlay helpers ──
function _createProgressOverlay(dbName) {
    const overlay = document.createElement("div");
    overlay.className = "sm_backup_progress_overlay";
    overlay.innerHTML = `
        <div class="sm_backup_progress_dialog">
            <div class="sm_backup_progress_icon">
                <i class="fa fa-database fa-3x text-primary"></i>
            </div>
            <h5 class="mt-3 mb-1">Backing up database...</h5>
            <p class="text-muted small mb-3">${dbName}</p>
            <div class="sm_backup_progress_bar_wrap">
                <div class="sm_backup_progress_bar" style="width: 0%"></div>
            </div>
            <div class="sm_backup_status mt-2 text-muted small">Preparing backup...</div>
        </div>
    `;
    document.body.appendChild(overlay);
    return overlay;
}

function _animateProgress(overlay, token, onComplete) {
    const bar = overlay.querySelector(".sm_backup_progress_bar");
    const status = overlay.querySelector(".sm_backup_status");
    const startTime = Date.now();
    const estimatedMs = 12000;

    const progressInterval = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const raw = 1 - Math.exp((-elapsed / estimatedMs) * 2.5);
        const percent = Math.min(Math.round(raw * 90), 90);
        bar.style.width = percent + "%";

        if (percent < 20) status.textContent = "Dumping database...";
        else if (percent < 50) status.textContent = "Compressing files...";
        else if (percent < 80) status.textContent = "Building archive...";
        else status.textContent = "Almost done...";
    }, 300);

    const cookieInterval = setInterval(() => {
        const cookie = document.cookie
            .split("; ")
            .find((c) => c.startsWith("sm_backup_token="));
        if (cookie && cookie.split("=")[1] === token) {
            document.cookie = "sm_backup_token=; Max-Age=0; Path=/";
            clearInterval(progressInterval);
            clearInterval(cookieInterval);
            bar.style.width = "100%";
            status.innerHTML = '<i class="fa fa-check text-success me-1"></i>Download started!';
            setTimeout(() => {
                overlay.remove();
                onComplete();
            }, 1500);
        }
    }, 500);

    setTimeout(() => {
        clearInterval(progressInterval);
        clearInterval(cookieInterval);
        if (overlay.parentNode) overlay.remove();
    }, 120000);
}

// Cache for group checks
let _groupsChecked = false;
let _isDbUser = false;
let _isDbManager = false;

async function _ensureGroups(env) {
    if (_groupsChecked) return;
    _groupsChecked = true;
    try {
        const results = await Promise.all([
            env.services.user.hasGroup("sm_db_manager.group_db_manager_user"),
            env.services.user.hasGroup("sm_db_manager.group_db_manager_manager"),
        ]);
        _isDbUser = results[0];
        _isDbManager = results[1];
    } catch {
        _isDbUser = false;
        _isDbManager = false;
    }
}

// ── Separator before DB section ──
function dbSeparator(env) {
    _ensureGroups(env);
    return {
        type: "separator",
        sequence: 80,
        hide: !_isDbUser,
    };
}

// ── #2 - DB Info (shown as text item) ──
function dbInfoItem(env) {
    _ensureGroups(env);
    const dbName = session.db || "unknown";
    return {
        type: "item",
        id: "db_info",
        description: _t("DB: %s", dbName),
        callback: async () => {
            // Fetch and display DB info via notification
            try {
                const result = await env.services.rpc("/sm_db_manager/db_info", {});
                if (result && !result.error) {
                    let msg = `DB: ${result.db_name} (${result.db_size_human})`;
                    if (result.last_backup) {
                        msg += `\nLast backup: ${result.last_backup}`;
                        if (result.last_backup_user) {
                            msg += ` by ${result.last_backup_user}`;
                        }
                    } else {
                        msg += "\nNo backup yet";
                    }
                    env.services.notification.add(msg, { type: "info", sticky: true });
                }
            } catch {
                env.services.notification.add(_t("Failed to load DB info"), { type: "danger" });
            }
        },
        sequence: 81,
        hide: !_isDbUser,
    };
}

// ── #1 - Quick Backup (ZIP) ──
function quickBackupItem(env) {
    _ensureGroups(env);
    return {
        type: "item",
        id: "quick_backup",
        description: _t("Quick Backup (ZIP)"),
        callback: () => {
            const token = `bk_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
            const dbName = session.db || "";

            const overlay = _createProgressOverlay(dbName);
            _animateProgress(overlay, token, () => {
                env.services.notification.add(_t("Backup completed!"), {
                    type: "success",
                });
            });

            const iframe = document.createElement("iframe");
            iframe.name = "sm_backup_frame";
            iframe.style.display = "none";
            document.body.appendChild(iframe);

            const form = document.createElement("form");
            form.method = "POST";
            form.action = "/sm_db_manager/backup";
            form.target = "sm_backup_frame";

            const addField = (name, value) => {
                const input = document.createElement("input");
                input.type = "hidden";
                input.name = name;
                input.value = value;
                form.appendChild(input);
            };
            addField("backup_format", "zip");
            addField("backup_token", token);

            document.body.appendChild(form);
            form.submit();
            document.body.removeChild(form);

            setTimeout(() => {
                if (iframe.parentNode) iframe.remove();
            }, 120000);
        },
        sequence: 82,
        hide: !_isDbManager,
    };
}

// ── #6 - Copy DB Name to Clipboard ──
function copyDbNameItem(env) {
    _ensureGroups(env);
    const dbName = session.db || "";
    return {
        type: "item",
        id: "copy_db_name",
        description: _t("Copy DB Name"),
        callback: async () => {
            try {
                await browser.navigator.clipboard.writeText(dbName);
                env.services.notification.add(
                    _t("Copied: %s", dbName),
                    { type: "success" }
                );
            } catch {
                env.services.notification.add(_t("Failed to copy"), {
                    type: "danger",
                });
            }
        },
        sequence: 83,
        hide: !_isDbUser,
    };
}

// ── Database Manager (open in new tab) ──
function databaseManagerItem(env) {
    _ensureGroups(env);
    const databaseURL = "/web/database/manager";
    return {
        type: "item",
        id: "database_manager",
        description: _t("Database Manager"),
        href: databaseURL,
        callback: () => {
            browser.open(databaseURL, "_blank");
        },
        sequence: 84,
        hide: !_isDbManager,
    };
}

userMenuRegistry.add("db_separator", dbSeparator);
userMenuRegistry.add("db_info", dbInfoItem);
userMenuRegistry.add("quick_backup", quickBackupItem);
userMenuRegistry.add("copy_db_name", copyDbNameItem);
userMenuRegistry.add("database_manager", databaseManagerItem);
