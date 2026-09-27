"""Durable local arrival-API budget, leaving room below the provider limit."""
import re
import sqlite3
from contextlib import closing
from datetime import datetime
from pathlib import Path


class BudgetExhausted(RuntimeError):
    pass


def reserve(db_path: Path, log_path: Path, private: bool = False) -> None:
    day = datetime.now().date().isoformat()
    with closing(sqlite3.connect(db_path, timeout=10)) as conn, conn:
        conn.execute("create table if not exists api_budget (day text primary key, total integer not null, private integer not null)")
        conn.execute("begin immediate")
        if not conn.execute("select 1 from api_budget where day=?", (day,)).fetchone():
            # Before this counter was installed, logs provide an upper estimate.
            initial = 0
            if log_path.exists():
                for line in log_path.read_text(encoding="utf-8", errors="replace").splitlines():
                    match = re.search(r"checked=(\d+)", line)
                    if line.startswith(day) and match:
                        initial += int(match.group(1))
            conn.execute("insert into api_budget values (?, ?, 0)", (day, initial))
        total, used_private = conn.execute("select total, private from api_budget where day=?", (day,)).fetchone()
        if total >= 9000 or (private and (used_private >= 800 or total >= 7000)):
            raise BudgetExhausted("quota exceeded: local arrival budget")
        conn.execute("update api_budget set total=total+1, private=private+? where day=?", (int(private), day))
