"""Download the pinned ECDICT corpus and build an indexed, offline dictionary."""
import csv
import io
import json
from pathlib import Path
import sqlite3
import tempfile
import urllib.request

REVISION = '39cfb9672c0906b63569e0453c2e6abfb9ab182a'
ROOT = Path(__file__).resolve().parent
TARGET = ROOT / 'data' / 'ecdict.sqlite'


def main():
    if TARGET.exists():
        print('Local dictionary ready:', TARGET)
        return
    TARGET.parent.mkdir(exist_ok=True)
    url = f'https://raw.githubusercontent.com/skywind3000/ECDICT/{REVISION}/ecdict.csv'
    print('Downloading ECDICT…', flush=True)
    with tempfile.TemporaryDirectory(dir=TARGET.parent) as tmp:
        db = sqlite3.connect(str(Path(tmp) / 'ecdict.sqlite'))
        db.executescript('''
          CREATE TABLE entries (word TEXT PRIMARY KEY COLLATE NOCASE, data TEXT NOT NULL);
          CREATE TABLE forms (form TEXT, word TEXT, PRIMARY KEY(form, word));
          CREATE TABLE metadata (revision TEXT);
        ''')
        count = 0
        with urllib.request.urlopen(url, timeout=90) as response:
            for row in csv.DictReader(io.TextIOWrapper(response, encoding='utf-8-sig')):
                word = row['word'].strip()
                if not word:
                    continue
                fields = {key: row.get(key, '') for key in ['word', 'phonetic', 'translation', 'definition', 'exchange', 'tag']}
                db.execute('INSERT OR IGNORE INTO entries VALUES (?, ?)', (word, json.dumps(fields, ensure_ascii=False)))
                for change in row.get('exchange', '').split('/'):
                    kind, sep, form = change.partition(':')
                    if sep and kind in ['p', 'd', 'i', '3', 'r', 't', 's']:
                        db.execute('INSERT OR IGNORE INTO forms VALUES (?, ?)', (form.lower(), word))
                count += 1
        if count < 100000:
            raise RuntimeError('Incomplete dictionary download')
        db.execute('INSERT INTO metadata VALUES (?)', (REVISION,))
        db.commit()
        db.close()
        (Path(tmp) / 'ecdict.sqlite').replace(TARGET)
    print(f'Local dictionary ready: {count:,} entries', flush=True)


if __name__ == '__main__':
    main()
