"""Read a Tachimanga .tmb without extracting or executing bundled extensions."""
import io
import json
import sqlite3
import sys
import zipfile


def read_member(archive, name, limit):
    info = archive.getinfo(name)
    if info.file_size > limit:
        raise ValueError(f"{name} exceeds the supported backup size")
    return archive.read(info)


def read_backup(path):
    with zipfile.ZipFile(path) as outer:
        contents = read_member(outer, 'contents.zip', 256 * 1024 * 1024)
    with zipfile.ZipFile(io.BytesIO(contents)) as inner:
        database = read_member(inner, 'tachimanga.db', 256 * 1024 * 1024)
    connection = sqlite3.connect(':memory:')
    try:
        connection.deserialize(database)
        connection.execute('PRAGMA query_only=ON')
        connection.execute('PRAGMA trusted_schema=OFF')
        connection.row_factory = sqlite3.Row
        categories = {}
        for row in connection.execute('''
            SELECT cm.manga, c.name FROM CategoryManga cm
            JOIN Category c ON c.id = cm.category WHERE c.is_delete = 0
            ORDER BY c."order", c.id
        '''):
            categories.setdefault(row['manga'], []).append(row['name'])
        entries = []
        for row in connection.execute('''
            SELECT m.id, m.url, m.real_url, m.title, m.author, m.artist,
                   m.description, m.genre, m.thumbnail_url,
                   s.name AS source_name, s.lang, e.pkg_name
            FROM Manga m LEFT JOIN Source s ON s.id = m.source
            LEFT JOIN Extension e ON e.id = s.extension
            WHERE m.in_library = 1 ORDER BY m.id
        '''):
            entry = dict(row)
            entry['categories'] = categories.get(row['id'], [])
            entries.append(entry)
        return entries
    finally:
        connection.close()


if __name__ == '__main__':
    print(json.dumps(read_backup(sys.argv[1]), ensure_ascii=True))
