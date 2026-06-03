from flask import Flask, render_template, request, jsonify, session, redirect, url_for, send_file, send_from_directory
import csv
import os
import hashlib
import secrets
import string
import glob
from datetime import datetime, time
import ssl
import sys
import random
import pandas as pd
from docxtpl import DocxTemplate
import tempfile
import base64
import locale
import re
import io
import json 
from filelock import FileLock
from gunicorn.app.base import BaseApplication
import subprocess
import signal
import pytz

app = Flask(__name__)
app.secret_key = 'clave_secreta_caep_simulador'

# --- ZONA HORARIA ---
MEXICO_TZ = pytz.timezone('America/Mexico_City')

def get_now_mexico():
    return datetime.now(MEXICO_TZ).replace(tzinfo=None)

# --- CONSTANTES Y ARCHIVOS ---
USERS_CSV = 'users.csv'
COURSES_CSV = 'cursos.csv'
QUESTIONS_CSV = 'preguntas.csv'
PUNTAJES_CSV = 'puntajes.csv'
RESULTADOS_CSV = 'resultados.csv'

# Archivos de sesión
SESSIONS_FILE = 'active_sessions.json' 
LOCK_FILE = 'active_sessions.lock'

# --- CARPETAS ---
PLANTILLAS_DIR = 'plantillas'
REGISTROS_DIR = 'registros'
IMG_PERFIL_DIR = os.path.join('static', 'img', 'perfil')

# --- MAPA DE PLANTILLAS DOCX ---
TEMPLATE_MAP = {
    'ECOEMS 2026': 'ecoems_registro.docx',
    'LICENCIATURA 2026': 'licenciatura_registro.docx'
}

# --- MAPA DE PLANTILLAS DOCX (COMPROBANTE) ---
COMPROBANTE_TEMPLATE_MAP = {
    'ECOEMS 2026': 'ecoems_comprobante_registro.docx',
    'LICENCIATURA 2026': 'licenciatura_comprobante_registro.docx'
}

# --- MAPA DE CARPETAS DE REGISTRO ANIDADAS ---
REGISTROS_MAP = {
    'ECOEMS 2026': 'registros_ecoems',
    'LICENCIATURA 2026': 'registros_licenciatura'
}

# --- MAPA DE CARPETAS DE COMPROBANTE ANIDADAS ---
COMPROBANTES_MAP = {
    'ECOEMS 2026': 'comprobantes_ecoems',
    'LICENCIATURA 2026': 'comprobantes_licenciatura'
}

# --- MAPA DE PLANTILLAS SELECCIÓN (DOCUMENTO A) ---
SELECCION_TEMPLATE_MAP = {
    'ECOEMS 2026': 'ecoems_documento_a.docx',
    'LICENCIATURA 2026': 'licenciatura_documento_a.docx'
}

# --- MAPA DE CARPETAS DE SALIDA SELECCIÓN ---
SELECCION_DIR_MAP = {
    'ECOEMS 2026': 'ecoems_documento_a',
    'LICENCIATURA 2026': 'licenciatura_documento_a'
}

# --- MANEJO DE SESIONES MULTI-WORKER SEGURO ---

def is_user_logged_in(email): 
    try:
        with FileLock(LOCK_FILE, timeout=5):
            if not os.path.exists(SESSIONS_FILE): return False
            with open(SESSIONS_FILE, 'r') as f:
                sessions = json.load(f)
            return email in sessions
    except:
        return False

def get_user_session_id(email):
    try:
        with FileLock(LOCK_FILE, timeout=5):
            if not os.path.exists(SESSIONS_FILE): return None
            with open(SESSIONS_FILE, 'r') as f:
                sessions = json.load(f)
            return sessions.get(email, {}).get('session_id')
    except:
        return None

def add_active_session(email, session_id): 
    try:
        with FileLock(LOCK_FILE, timeout=5):
            sessions = {}
            if os.path.exists(SESSIONS_FILE):
                with open(SESSIONS_FILE, 'r') as f:
                    try: sessions = json.load(f)
                    except: pass
            
            sessions[email] = {
                'session_id': session_id, 
                'login_time': get_now_mexico().strftime("%Y-%m-%d %H:%M:%S")
            }
            
            with open(SESSIONS_FILE, 'w') as f:
                json.dump(sessions, f)
    except Exception as e:
        print(f"Error guardando sesión: {e}")

def remove_active_session(email): 
    try:
        with FileLock(LOCK_FILE, timeout=5):
            if not os.path.exists(SESSIONS_FILE): return
            with open(SESSIONS_FILE, 'r') as f:
                try: sessions = json.load(f)
                except: sessions = {}
            
            if email in sessions: 
                del sessions[email]
                with open(SESSIONS_FILE, 'w') as f:
                    json.dump(sessions, f)
    except Exception as e:
        print(f"Error removiendo sesión: {e}")

def init_csv():
    if not os.path.exists(USERS_CSV):
        with open(USERS_CSV, 'w', newline='', encoding='utf-8') as file:
            writer = csv.writer(file)
            header = ['folio', 'curso', 'username', 'nombre', 'apellido_paterno', 
                     'apellido_materno', 'email', 'fecha_nacimiento', 'password']
            header.extend([f'opcion{i}' for i in range(1, 11)])
            header.append('num_opciones_preferidas')
            writer.writerow(header)
    else:
        try:
            with open(USERS_CSV, 'r', newline='', encoding='utf-8') as file:
                reader = csv.reader(file)
                header = next(reader)
                rows = list(reader)
                changed = False

                if 'opcion1' not in header:
                    header.extend([f'opcion{i}' for i in range(1, 11)])
                    for row in rows:
                        row.extend([''] * 10)
                    changed = True
                
                if 'num_opciones_preferidas' not in header:
                    header.append('num_opciones_preferidas')
                    for row in rows:
                        row.append('')
                    changed = True
                
                if changed:
                    with open(USERS_CSV, 'w', newline='', encoding='utf-8') as new_file:
                        writer = csv.writer(new_file)
                        writer.writerow(header)
                        writer.writerows(rows)
        except Exception as e:
            print(f"Error al verificar/actualizar users.csv: {e}")
    
    if not os.path.exists(RESULTADOS_CSV):
        with open(RESULTADOS_CSV, 'w', newline='', encoding='utf-8') as file:
            writer = csv.writer(file)
            header = ['folio', 'curso', 'materia', 'Pregunta_número', 'Pregunta',
                     'Respuesta_a', 'Respuesta_b', 'Respuesta_c', 'Respuesta_d',
                     'Respuesta_seleccionada', 'Respuesta_correcta']
            writer.writerow(header)
    
    if not os.path.exists(SESSIONS_FILE):
        with open(SESSIONS_FILE, 'w') as f:
            json.dump({}, f)
    
    if not os.path.exists(PLANTILLAS_DIR): os.makedirs(PLANTILLAS_DIR)
    if not os.path.exists(REGISTROS_DIR): os.makedirs(REGISTROS_DIR)
    if not os.path.exists(IMG_PERFIL_DIR): os.makedirs(IMG_PERFIL_DIR)
        
    all_folders = list(REGISTROS_MAP.values()) + list(COMPROBANTES_MAP.values())
    for folder_name in SELECCION_DIR_MAP.values():
            full_path = os.path.join(REGISTROS_DIR, folder_name)
            if not os.path.exists(full_path): os.makedirs(full_path)

# --- FUNCIONES DE UTILIDAD ---

def convert_docx_to_pdf(docx_path, pdf_path):
    try:
        docx_abs = os.path.abspath(docx_path)
        pdf_abs = os.path.abspath(pdf_path)
        out_dir = os.path.dirname(pdf_abs)

        with tempfile.TemporaryDirectory() as tmp_profile:
            cmd = [
                'libreoffice',
                f'-env:UserInstallation=file://{tmp_profile}', 
                '--headless',
                '--nologo',
                '--nodefault',
                '--nofirststartwizard',
                '--convert-to', 'pdf',
                '--outdir', out_dir,
                docx_abs
            ]
            result = subprocess.run(cmd, capture_output=True, text=True, check=True)
            
        if os.path.exists(pdf_abs):
            return True
        else:
            return False

    except subprocess.CalledProcessError as e:
        return False
    except FileNotFoundError:
        return False
    except Exception as e:
        return False

def generate_random_password(length=10):
    alphabet = string.ascii_uppercase + string.digits
    return ''.join(secrets.choice(alphabet) for _ in range(length))

def generate_random_username():
    while True:
        part1 = random.choice(string.ascii_uppercase)
        part2 = ''.join(random.choice(string.digits) for _ in range(5))
        part3 = ''.join(random.choice(string.ascii_uppercase) for _ in range(2))
        username = f"{part1}{part2}{part3}"
        if not username_exists(username): return username

def generate_folio(curso_str):
    match = re.search(r'(\d{4})', curso_str)
    year_prefix = match.group(1)[-2:] if match else get_now_mexico().strftime('%y')
    while True:
        folio = f"{year_prefix}" + ''.join(random.choice(string.digits) for _ in range(7))
        if not folio_exists(folio): return folio

def folio_exists(folio):
    try:
        with open(USERS_CSV, 'r', newline='', encoding='utf-8') as f:
            return any(row['folio'] == folio for row in csv.DictReader(f))
    except: return False

def user_exists(email):
    try:
        with open(USERS_CSV, 'r', newline='', encoding='utf-8') as f:
            return any(row['email'] == email for row in csv.DictReader(f))
    except: return False

def username_exists(username):
    try:
        with open(USERS_CSV, 'r', newline='', encoding='utf-8') as f:
            return any(row['username'] == username for row in csv.DictReader(f))
    except: return False

def add_user(folio, curso, username, nombre, apellido_paterno, apellido_materno, email, fecha_nacimiento, password):
    with open(USERS_CSV, 'a', newline='', encoding='utf-8') as file:
        writer = csv.writer(file)
        row = [folio, curso, username, nombre, apellido_paterno, apellido_materno, email, fecha_nacimiento, password]
        row.extend([''] * 10)
        row.append('')
        writer.writerow(row)

def verify_user(username, password):
    try:
        with open(USERS_CSV, 'r', newline='', encoding='utf-8') as f:
            return any(row['username'] == username and row['password'] == password for row in csv.DictReader(f))
    except: return False

def get_user_by_email(email):
    try:
        with open(USERS_CSV, 'r', newline='', encoding='utf-8') as f:
            for row in csv.DictReader(f):
                if row['email'] == email: return row
    except: pass
    return None

def get_user_by_username(username):
    try:
        with open(USERS_CSV, 'r', newline='', encoding='utf-8') as f:
            for row in csv.DictReader(f):
                if row['username'] == username: return row
    except: pass
    return None

def generate_self_signed_cert():
    cert_file, key_file = 'cert.pem', 'key.pem'
    if not os.path.exists(cert_file) or not os.path.exists(key_file):
        try:
            from OpenSSL import crypto
            key = crypto.PKey(); key.generate_key(crypto.TYPE_RSA, 4096)
            cert = crypto.X509(); cert.get_subject().CN = 'localhost'
            cert.set_serial_number(1000); cert.gmtime_adj_notBefore(0); cert.gmtime_adj_notAfter(365*24*60*60)
            cert.set_issuer(cert.get_subject()); cert.set_pubkey(key); cert.sign(key, 'sha256')
            with open(cert_file, 'wb') as f: f.write(crypto.dump_certificate(crypto.FILETYPE_PEM, cert))
            with open(key_file, 'wb') as f: f.write(crypto.dump_privatekey(crypto.FILETYPE_PEM, key))
            return (cert_file, key_file)
        except ImportError: return 'adhoc'
    else: return (cert_file, key_file)

def parse_duration_to_seconds(duration_str):
    try: h, m, s = map(int, duration_str.split(':')); return h * 3600 + m * 60 + s
    except: return 10800

def get_exam_status(fecha_str, inicio_str, final_str):
    try:
        now = get_now_mexico()
        if pd.isna(fecha_str) or pd.isna(inicio_str) or pd.isna(final_str): return "No disponible", False
        
        fecha_clean = str(fecha_str).strip()
        try:
            exam_date = datetime.strptime(fecha_clean, '%Y-%m-%d').date()
        except ValueError:
            try:
                exam_date = datetime.strptime(fecha_clean, '%d/%m/%Y').date()
            except:
                return "Error Fecha", False

        inicio_clean = str(inicio_str).strip()
        final_clean = str(final_str).strip()
        
        start = datetime.combine(exam_date, datetime.strptime(inicio_clean, '%H:%M:%S').time())
        end = datetime.combine(exam_date, datetime.strptime(final_clean, '%H:%M:%S').time())
        
        if now < start: return "Aún no empieza", False
        elif start <= now <= end: return "Disponible", True
        else: return "Finalizado", False
    except Exception as e: 
        return "Error Datos", False

def check_exam_taken(folio, curso, materia):
    if not os.path.exists(RESULTADOS_CSV):
        return False
    try:
        df_res = pd.read_csv(RESULTADOS_CSV, encoding='utf-8')
        taken = df_res[
            (df_res['folio'].astype(str) == str(folio)) & 
            (df_res['curso'] == curso) & 
            (df_res['materia'] == materia)
        ].shape[0] > 0
        return taken
    except Exception as e:
        try:
            with open(RESULTADOS_CSV, 'r', encoding='utf-8') as f:
                reader = csv.DictReader(f)
                for row in reader:
                    if (row['folio'] == str(folio) and 
                        row['curso'] == curso and 
                        row['materia'] == materia):
                        return True
        except: pass
        return False

# --- FUNCIONES PARA ADMINISTRACIÓN ---

def get_all_users():
    try:
        with open(USERS_CSV, 'r', newline='', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            users = list(reader)
            for user in users:
                user['nombre_completo'] = f"{user['nombre']} {user['apellido_paterno']} {user['apellido_materno']}".upper()
            return users
    except Exception as e:
        return []

def get_user_stats():
    try:
        with open(USERS_CSV, 'r', newline='', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            users = list(reader)
            
            stats = {
                'total': len(users),
                'por_curso': {},
                'con_opciones': 0,
                'sin_opciones': 0
            }
            
            for user in users:
                curso = user['curso']
                if curso in stats['por_curso']:
                    stats['por_curso'][curso] += 1
                else:
                    stats['por_curso'][curso] = 1
                
                tiene_opciones = any(user.get(f'opcion{i}') for i in range(1, 11))
                if tiene_opciones:
                    stats['con_opciones'] += 1
                else:
                    stats['sin_opciones'] += 1
            
            return stats
    except Exception as e:
        return {'total': 0, 'por_curso': {}, 'con_opciones': 0, 'sin_opciones': 0}

def get_admin_user():
    try:
        with open(USERS_CSV, 'r', newline='', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            rows = list(reader)
            if rows:
                return rows[0]
    except Exception as e:
        return None

def is_admin_user():
    if not session.get('logged_in'): return False
    admin_user = get_admin_user()
    if not admin_user: return False
    current_user = get_user_by_email(session['user'])
    if not current_user: return False
    return current_user.get('folio') == admin_user.get('folio')

def get_courses_list():
    try:
        df = pd.read_csv(COURSES_CSV, encoding='utf-8-sig')
        return df['curso'].dropna().unique().tolist()
    except Exception as e:
        return []

def update_user_in_csv(user_data):
    try:
        rows = []
        with open(USERS_CSV, 'r', newline='', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            fieldnames = reader.fieldnames
            rows = list(reader)
        
        updated = False
        for row in rows:
            if row['folio'] == user_data['folio']:
                for key in user_data:
                    if key in row:
                        row[key] = user_data[key]
                updated = True
                break
        
        if not updated: return False, "Usuario no encontrado"
        
        with open(USERS_CSV, 'w', newline='', encoding='utf-8') as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(rows)
        return True, "Usuario actualizado correctamente"
    except Exception as e:
        return False, str(e)

# --- FUNCIÓN PARA GUARDAR RESULTADOS ---

def save_exam_results(folio, curso, materia, respuestas):
    try:
        df_preguntas = pd.read_csv(QUESTIONS_CSV, encoding='utf-8', engine='python')
        preguntas_examen = df_preguntas[(df_preguntas['Curso'] == curso) & (df_preguntas['Materia'] == materia)]
        resultados = []
        
        for _, row in preguntas_examen.iterrows():
            pregunta_num = row['Pregunta_número']
            letra_seleccionada = respuestas.get(str(pregunta_num), '').strip()
            
            valor_a_guardar = ""
            letra_lower = letra_seleccionada.lower()
            
            if letra_lower == 'a': valor_a_guardar = "Respuesta_a"
            elif letra_lower == 'b': valor_a_guardar = "Respuesta_b"
            elif letra_lower == 'c': valor_a_guardar = "Respuesta_c"
            elif letra_lower == 'd': valor_a_guardar = "Respuesta_d"
            else: valor_a_guardar = "" 

            resultado = {
                'folio': folio,
                'curso': curso,
                'materia': materia,
                'Pregunta_número': pregunta_num,
                'Pregunta': row['Pregunta'],
                'Respuesta_a': row['Respuesta_a'],
                'Respuesta_b': row['Respuesta_b'],
                'Respuesta_c': row['Respuesta_c'],
                'Respuesta_d': row['Respuesta_d'],
                'Respuesta_seleccionada': valor_a_guardar,
                'Respuesta_correcta': row['Respuesta_correcta']
            }
            resultados.append(resultado)
        
        file_exists = os.path.exists(RESULTADOS_CSV)
        with open(RESULTADOS_CSV, 'a', newline='', encoding='utf-8') as f:
            fieldnames = ['folio', 'curso', 'materia', 'Pregunta_número', 'Pregunta',
                         'Respuesta_a', 'Respuesta_b', 'Respuesta_c', 'Respuesta_d',
                         'Respuesta_seleccionada', 'Respuesta_correcta']
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            if not file_exists:
                writer.writeheader()
            for resultado in resultados:
                writer.writerow(resultado)
        
        return True, "Resultados guardados correctamente"
    except Exception as e:
        return False, str(e)

# --- LÓGICA DE ESCUELAS ---

def get_escuelas_por_curso(curso_usuario):
    if not os.path.exists(PUNTAJES_CSV): return []
    try:
        df = pd.read_csv(PUNTAJES_CSV, encoding='utf-8-sig')
    except:
        try: df = pd.read_csv(PUNTAJES_CSV, encoding='latin-1')
        except: return []

    df.columns = df.columns.str.strip()
    cols = df.columns

    col_inst = next((c for c in cols if c.lower() in ['institución', 'institucion', 'universidad']), None)
    col_esc = next((c for c in cols if c.lower() in ['escuela', 'plantel', 'facultad']), None)
    col_ptj = next((c for c in cols if c.lower() in ['puntaje', 'puntos', 'aciertos']), None)
    col_curso = next((c for c in cols if c.lower() in ['curso', 'nivel']), None)
    
    col_area = next((c for c in cols if c.lower() in ['área', 'area', 'campo']), None)
    col_carrera = next((c for c in cols if c.lower() in ['carrera', 'licenciatura', 'programa']), None)

    if not col_inst or not col_esc: return []

    if col_curso:
        base = curso_usuario.split()[0]
        mask = (df[col_curso].astype(str).str.strip() == curso_usuario) | (df[col_curso].astype(str).str.strip() == base)
        df = df[mask].copy()

    data = []
    excludes = [col_curso, col_inst, col_esc, col_ptj, col_area, col_carrera]
    meta_cols = [c for c in df.columns if c not in excludes and c is not None]

    for _, row in df.iterrows():
        try:
            ptj_val = float(row[col_ptj]) if col_ptj and pd.notna(row[col_ptj]) else 0.0
            ptj_str = f"{int(ptj_val)}" if col_ptj and pd.notna(row[col_ptj]) else "N/A"
        except: ptj_val, ptj_str = 0.0, "N/A"

        meta = {}
        for mc in meta_cols:
            if pd.notna(row[mc]): meta[mc] = str(row[mc]).strip()
        
        area = str(row[col_area]).strip() if col_area and pd.notna(row[col_area]) else ""
        carrera = str(row[col_carrera]).strip() if col_carrera and pd.notna(row[col_carrera]) else ""
        plantel = str(row[col_esc]).strip()

        data.append({
            'institucion': str(row[col_inst]).strip(),
            'escuela': plantel,
            'area': area,
            'carrera': carrera,
            'puntaje': ptj_val,
            'puntaje_str': ptj_str,
            'metadata': meta
        })
    return data

def natural_keys(text): return [int(c) if c.isdigit() else c for c in re.split(r'(\d+)', str(text))]

def get_instituciones_unicas(data):
    return sorted(list(set(d['institucion'] for d in data if d['institucion'])), key=natural_keys)

def get_planteles_por_institucion(institucion, data):
    return [d for d in data if d['institucion'] == institucion]

def guardar_opciones_escuelas(curso, folio, opciones, num_pref=None):
    try:
        rows = []
        with open(USERS_CSV, 'r', newline='', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            fieldnames = reader.fieldnames
            rows = list(reader)
        
        updated = False
        for row in rows:
            if row['folio'] == str(folio) and row['curso'] == curso:
                for i in range(1, 11):
                    row[f'opcion{i}'] = opciones[i-1] if i-1 < len(opciones) else ''
                if num_pref: row['num_opciones_preferidas'] = str(num_pref)
                updated = True
                break
        
        if not updated: return False, "Usuario no encontrado"
        
        with open(USERS_CSV, 'w', newline='', encoding='utf-8') as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(rows)
        return True, "Guardado correctamente"
    except Exception as e: return False, str(e)

def cargar_opciones_escuelas(curso, folio):
    opciones = [{} for _ in range(10)]
    num_pref = 0
    try:
        with open(USERS_CSV, 'r', newline='', encoding='utf-8') as f:
            for row in csv.DictReader(f):
                if row['folio'] == str(folio) and row['curso'] == curso:
                    try: num_pref = int(row.get('num_opciones_preferidas', 0))
                    except: num_pref = 0
                    
                    for i in range(1, 11):
                        val = row.get(f'opcion{i}', '')
                        if val:
                            parts = val.split('|')
                            if len(parts) >= 4:
                                opciones[i-1] = {
                                    'escuela': parts[0],
                                    'area': parts[1],
                                    'carrera': parts[2],
                                    'plantel': parts[3],
                                    'full_value': val,
                                    'puntaje': "N/A"
                                }
                            elif len(parts) >= 2:
                                opciones[i-1] = {
                                    'escuela': parts[0],
                                    'plantel': parts[1],
                                    'full_value': val,
                                    'puntaje': "N/A"
                                }
                    break
    except: pass
    return opciones, num_pref

init_csv()

# --- RUTAS ---
@app.route('/')
def index(): return render_template('index.html')

@app.route('/login', methods=['POST'])
def login():
    if request.method == 'POST':
        u = request.form.get('username')
        p = request.form.get('password')
        if not u or not p: return jsonify({'success': False, 'message': 'Faltan campos'})
        user = get_user_by_username(u)
        if not user: return jsonify({'success': False, 'message': 'Credenciales incorrectas'})
        
        if is_user_logged_in(user['email']):
            return jsonify({'success': False, 'message': 'Sesión activa', 'session_active': True})
        
        if verify_user(u, p):
            session['user'] = user['email']; session['logged_in'] = True
            session['session_id'] = os.urandom(16).hex()
            session['fullname'] = f"{user['nombre']} {user['apellido_paterno']} {user['apellido_materno']}".upper()
            session['curso'] = user['curso']; session['folio'] = user['folio']
            add_active_session(user['email'], session['session_id'])
            return jsonify({'success': True, 'message': 'Login exitoso', 'redirect': '/launcher'})
        else: return jsonify({'success': False, 'message': 'Credenciales incorrectas'})

@app.route('/force-login', methods=['POST'])
def force_login():
    if request.method == 'POST':
        u = request.form.get('username')
        p = request.form.get('password')
        if verify_user(u, p):
            user = get_user_by_username(u)
            remove_active_session(user['email'])
            session['user'] = user['email']; session['logged_in'] = True
            session['session_id'] = os.urandom(16).hex()
            session['fullname'] = f"{user['nombre']} {user['apellido_paterno']} {user['apellido_materno']}".upper()
            session['curso'] = user['curso']; session['folio'] = user['folio']
            add_active_session(user['email'], session['session_id'])
            return jsonify({'success': True, 'redirect': '/launcher'})
    return jsonify({'success': False})

@app.route('/register', methods=['POST'])
def register():
    if request.method == 'POST':
        nombre = request.form.get('nombre')
        apellido_paterno = request.form.get('apellido_paterno')
        apellido_materno = request.form.get('apellido_materno')
        email = request.form.get('email')
        confirm_email = request.form.get('confirm_email')
        fecha_nacimiento = request.form.get('fecha_nacimiento')
        curso = request.form.get('curso', '').strip()
        
        edad = request.form.get('edad')
        nombre_tutor = request.form.get('nombre_tutor')
        domicilio = request.form.get('domicilio')
        ocupacion_tutor = request.form.get('ocupacion_tutor')
        tel_particular = request.form.get('tel_particular')
        tel_celular = request.form.get('tel_celular')
        
        campos_extra = [
            'si_no_trabajar', 'trabajar_donde', 'si_no_estudiar', 'estudiar_donde',
            'si_no_dejar', 'dejar_donde', 'si_no_leer', 'leer_que',
            'materias_agrado', 'materias_complejas', 'materias_desagrado', 'materias_por_que',
            'motivar_estudiar', 'horas_tareas', 'horas_estudiar', 'si_no_estudiar_solo',
            'si_no_papas_tarea', 'papas_tarea_cuando', 'si_no_deporte', 'deporte_cual',
            'promedio_primero', 'promedio_segundo', 'promedio_actual',
            'escuela_objetivo', 'estudiar_objetivo', 'curso_objetivo', 'comprometer_estudiar',
            'corto_plazo', 'mediano_plazo', 'largo_plazo',
            'si_no_enfermedad', 'enfermedad_cual', 'si_no_medicamento', 'medicamento_cual',
            'si_no_seguro', 'seguro_cual'
        ]
        data_pdf = {k: request.form.get(k, '') for k in campos_extra}
        
        if not all([nombre, apellido_paterno, apellido_materno, email, confirm_email, fecha_nacimiento, curso]):
            return jsonify({'success': False, 'message': 'Completa todos los campos obligatorios'})
        
        if email != confirm_email: return jsonify({'success': False, 'message': 'Correos no coinciden'})
        if user_exists(email): return jsonify({'success': False, 'message': 'Correo ya registrado'})
            
        new_folio = generate_folio(curso)
        random_username = generate_random_username()
        random_password = generate_random_password()
        
        add_user(new_folio, curso, random_username, nombre, apellido_paterno, apellido_materno, email, fecha_nacimiento, random_password)
        nombre_completo = f"{nombre} {apellido_paterno} {apellido_materno}".upper()
        
        try: locale.setlocale(locale.LC_TIME, 'es_ES.UTF-8')
        except: pass
        
        fecha_nac_fmt = fecha_nacimiento
        try:
            dt = datetime.strptime(fecha_nacimiento, '%Y-%m-%d')
            fecha_nac_fmt = dt.strftime('%d de %B de %Y')
        except: pass
        
        fecha_reg_fmt = get_now_mexico().strftime('%d de %B de %Y')

        pdf_registro_b64 = None
        pdf_registro_name = None
        pdf_comprobante_b64 = None
        pdf_comprobante_name = None
        
        if curso in TEMPLATE_MAP and curso in REGISTROS_MAP:
            try:
                contexto = {
                    'nombre_alumno': nombre_completo, 'fecha_nac': fecha_nac_fmt, 'edad': edad,
                    'nombre_tutor': nombre_tutor, 'domicilio': domicilio, 'ocupacion_tutor': ocupacion_tutor,
                    'tel_particular': tel_particular, 'tel_celular': tel_celular, 'email': email,
                    'fecha': fecha_reg_fmt, **data_pdf
                }
                template_name = TEMPLATE_MAP[curso]
                template_path = os.path.join(PLANTILLAS_DIR, template_name)
                
                if os.path.exists(template_path):
                    doc = DocxTemplate(template_path)
                    doc.render(contexto)
                    
                    target_dir = os.path.join(REGISTROS_DIR, REGISTROS_MAP[curso])
                    base_name = f"registro_{curso.replace(' ','_').lower()}_{random_username}"
                    pdf_registro_name = f"{base_name}.pdf"
                    doc_path = os.path.join(target_dir, f"{base_name}.docx")
                    pdf_path = os.path.join(target_dir, pdf_registro_name)
                    
                    doc.save(doc_path)
                    convert_docx_to_pdf(doc_path, pdf_path)
                    
                    with open(pdf_path, "rb") as f:
                        pdf_registro_b64 = base64.b64encode(f.read()).decode('utf-8')
            except Exception as e: print(f"Error PDF Registro: {e}")

        if curso in COMPROBANTE_TEMPLATE_MAP and curso in COMPROBANTES_MAP:
            try:
                contexto_comp = {
                    'folio_alumno': new_folio, 'nombre_alumno': nombre_completo,
                    'usuario_alumno': random_username, 'contraseña_alumno': random_password
                }
                template_path = os.path.join(PLANTILLAS_DIR, COMPROBANTE_TEMPLATE_MAP[curso])
                
                if os.path.exists(template_path):
                    doc = DocxTemplate(template_path)
                    doc.render(contexto_comp)
                    
                    target_dir = os.path.join(REGISTROS_DIR, COMPROBANTES_MAP[curso])
                    base_name = f"comprobante_{curso.replace(' ','_').lower()}_{random_username}"
                    pdf_comprobante_name = f"{base_name}.pdf"
                    doc_path = os.path.join(target_dir, f"{base_name}.docx")
                    pdf_path = os.path.join(target_dir, pdf_comprobante_name)
                    
                    doc.save(doc_path)
                    convert_docx_to_pdf(doc_path, pdf_path)
                    
                    with open(pdf_path, "rb") as f:
                        pdf_comprobante_b64 = base64.b64encode(f.read()).decode('utf-8')
            except Exception as e: print(f"Error PDF Comprobante: {e}")

        return jsonify({
            'success': True,
            'message': 'Registro exitoso.',
            'username': random_username,
            'password': random_password,
            'pdf_b64': pdf_registro_b64, 'pdf_name': pdf_registro_name,
            'pdf_comprobante_b64': pdf_comprobante_b64, 'pdf_comprobante_name': pdf_comprobante_name
        })

@app.route('/recover-credentials', methods=['POST'])
def recover_credentials():
    if request.method == 'POST':
        email = request.form.get('email')
        confirm_email = request.form.get('confirm_email')
        fecha_nacimiento = request.form.get('fecha_nacimiento')
        
        if not all([email, confirm_email, fecha_nacimiento]):
            return jsonify({'success': False, 'message': 'Completa campos'})
        if email != confirm_email: return jsonify({'success': False, 'message': 'Correos no coinciden'})
            
        user = get_user_by_email(email)
        if not user or user['fecha_nacimiento'] != fecha_nacimiento:
            return jsonify({'success': False, 'message': 'Datos incorrectos'})
            
        return jsonify({
            'success': True,
            'message': 'Credenciales recuperadas.',
            'username': user['username'],
            'password': user['password']
        })

@app.route('/api/get-courses')
def get_courses():
    try:
        df = pd.read_csv(COURSES_CSV, encoding='utf-8-sig', engine='python')
        return jsonify({'success': True, 'courses': df['curso'].dropna().unique().tolist()})
    except Exception as e: return jsonify({'success': False, 'message': str(e)}), 500

@app.route('/api/courses')
def api_courses():
    if not session.get('logged_in'): return jsonify({'success': False}), 401
    user_course = session.get('curso')
    user_folio = session.get('folio')
    if not user_course: return jsonify({})

    try:
        try:
            df = pd.read_csv(COURSES_CSV, encoding='utf-8-sig', engine='python')
        except:
            df = pd.read_csv(COURSES_CSV, encoding='latin-1', engine='python')
            
        df.columns = df.columns.str.strip().str.lower()
        
        col_curso = next((c for c in df.columns if c == 'curso'), None)
        
        if col_curso:
            df['curso_norm'] = df[col_curso].astype(str).str.strip().str.upper()
            user_course_norm = str(user_course).strip().upper()
            
            df_user = df[df['curso_norm'] == user_course_norm].copy()
            df_user = df_user.dropna(subset=['materia'])
            
            data = {}
            for _, row in df_user.iterrows():
                materia_name = row.get('materia', 'Sin Nombre')
                fecha = row.get('fecha_disponible')
                inicio = row.get('horario_inicio')
                fin = row.get('horario_final')
                fecha_res = row.get('fecha_resultado', '')
                hora_res = row.get('horario_resultado', '')
                
                st, av = get_exam_status(fecha, inicio, fin)
                
                is_taken = check_exam_taken(user_folio, user_course, materia_name)
                
                data[materia_name] = {
                    'name': materia_name, 
                    'code': materia_name, 
                    'status': st, 
                    'available': av,
                    'time': f"{fecha} | {inicio} a {fin}",
                    'raw_date': str(fecha),
                    'raw_start': str(inicio),
                    'raw_end': str(fin),
                    'taken': is_taken,
                    'results_date': str(fecha_res).strip(),
                    'results_time': str(hora_res).strip()
                }
            return jsonify(data)
        else:
            return jsonify({})
            
    except Exception as e:
        return jsonify({})

@app.route('/launcher')
def launcher():
    if not session.get('logged_in'): return redirect(url_for('index'))
    is_admin = is_admin_user()
    return render_template('launcher.html', user=session['user'], fullname=session.get('fullname'), curso=session.get('curso'), is_admin=is_admin)

@app.route('/perfil')
def perfil():
    if not session.get('logged_in'): return redirect(url_for('index'))
    
    user_data = get_user_by_email(session['user'])
    admin_user = get_admin_user()
    is_admin = user_data.get('folio') == admin_user.get('folio') if admin_user else False
    
    curso_clean = user_data['curso'].strip().replace(' ', '_')
    filename = f"{user_data['folio']}_{curso_clean}.png"
    full_path_img = os.path.join(IMG_PERFIL_DIR, filename)
    
    if os.path.exists(full_path_img):
        import time
        foto_url = url_for('static', filename=f'img/perfil/{filename}', v=int(time.time()))
    else:
        foto_url = url_for('static', filename='img/foto_perfil.png')

    materiales = []
    mapa_materias = {
        'Español': 'espanol', 'Matemáticas': 'matematicas', 'Física': 'fisica',
        'Química': 'quimica', 'Biología': 'biologia', 'Historia': 'historia', 'Geografía': 'geografia'
    }
    curso_str = user_data['curso'].upper()
    carpeta_curso = ''
    if 'ECOEMS' in curso_str: carpeta_curso = 'ecoems'
    elif 'LICENCIATURA' in curso_str: carpeta_curso = 'licenciatura'
    
    if carpeta_curso:
        base_src = os.path.join(app.static_folder, 'src', carpeta_curso)
        for nombre_display, nombre_carpeta in mapa_materias.items():
            ruta_materia = os.path.join(base_src, nombre_carpeta)
            if os.path.exists(ruta_materia):
                for archivo in os.listdir(ruta_materia):
                    ruta_completa_archivo = os.path.join(ruta_materia, archivo)
                    if os.path.isfile(ruta_completa_archivo) and not archivo.startswith('.'):
                        rel_path = os.path.relpath(ruta_completa_archivo, app.static_folder)
                        url_preview = url_for('descargar_material', archivo=rel_path.replace('\\', '/'), modo='ver')
                        materiales.append({
                            'nombre': archivo,
                            'url': url_preview, 
                            'path': rel_path.replace('\\', '/'),
                            'materia_key': nombre_carpeta, 'materia_name': nombre_display
                        })

    tipo_curso = 'ecoems' if 'ECOEMS' in curso_str else 'licenciatura'
    username = user_data.get('username', '')
    folio = user_data.get('folio', '')

    docs_to_search = [
        {'label': 'Registro', 'folder': f'registros_{tipo_curso}', 'pattern': f'registro_*_{username}.pdf'},
        {'label': 'Comprobante de Registro', 'folder': f'comprobantes_{tipo_curso}', 'pattern': f'comprobante_*_{username}.pdf'},
        {'label': 'Documento A', 'folder': f'{tipo_curso}_documento_a', 'pattern': f'{folio}_*_documento_a.pdf'},
        {'label': 'Documento B', 'folder': f'{tipo_curso}_documento_b', 'pattern': f'{folio}_*_documento_b.pdf'},
        {'label': 'Documento C', 'folder': f'{tipo_curso}_documento_c', 'pattern': f'{folio}_*_documento_c.pdf'}
    ]

    documentos_personales = []

    for doc in docs_to_search:
        search_path = os.path.join(REGISTROS_DIR, doc['folder'], doc['pattern'])
        found_files = glob.glob(search_path)
        
        doc_info = {
            'label': doc['label'],
            'found': False,
            'url_preview': '#',
            'path_download': ''
        }

        if found_files:
            full_path_found = found_files[0]
            filename_only = os.path.basename(full_path_found)
            rel_path = os.path.join(REGISTROS_DIR, doc['folder'], filename_only).replace('\\', '/')
            
            doc_info['found'] = True
            doc_info['path_download'] = rel_path
            doc_info['url_preview'] = url_for('descargar_material', archivo=rel_path, modo='ver')

        documentos_personales.append(doc_info)

    return render_template('perfil.html', 
                         fullname=session.get('fullname'), 
                         user_data=user_data,
                         is_admin=is_admin,
                         foto_url=foto_url,
                         materiales=materiales,
                         materias_lista=mapa_materias,
                         documentos_personales=documentos_personales)

@app.route('/api/descargar_material')
def descargar_material():
    if not session.get('logged_in'): return redirect(url_for('index'))
    
    ruta_relativa = request.args.get('archivo')
    modo = request.args.get('modo', 'descargar') 
    
    if not ruta_relativa:
        return "Falta el parámetro archivo", 400

    try:
        ruta_relativa = ruta_relativa.lstrip('/').replace('\\', '/')
        if ruta_relativa.startswith(REGISTROS_DIR) or ruta_relativa.startswith('registros'):
            directorio_base = app.root_path  
        else:
            directorio_base = app.static_folder

        ruta_completa = os.path.join(directorio_base, ruta_relativa)
        
        if not os.path.exists(ruta_completa):
            return "Archivo no encontrado en el servidor", 404

        directorio = os.path.dirname(ruta_completa)
        nombre_archivo = os.path.basename(ruta_completa)

        es_adjunto = (modo != 'ver')

        return send_from_directory(
            directorio, 
            nombre_archivo, 
            as_attachment=es_adjunto, 
            mimetype='application/pdf',
            download_name=nombre_archivo
        )
        
    except Exception as e:
        return f"Error interno: {str(e)}", 500

@app.route('/admin')
def admin():
    if not session.get('logged_in'): 
        return redirect(url_for('index'))
    
    if not is_admin_user():
        session['error_message'] = 'Acceso denegado. Solo el administrador puede acceder a esta página.'
        return redirect(url_for('launcher'))
    
    users = get_all_users()
    stats = get_user_stats()
    
    ALLOWED_CSVS = ['users.csv', 'cursos.csv', 'preguntas.csv', 'puntajes.csv', 'resultados.csv']
    files_info = []
    
    for f in ALLOWED_CSVS:
        if os.path.exists(f):
            size = os.path.getsize(f) / 1024 
            mtime = os.path.getmtime(f)
            mod_time = datetime.fromtimestamp(mtime).strftime('%Y-%m-%d %H:%M:%S')
            files_info.append({'name': f, 'size': f"{size:.2f} KB", 'modified': mod_time, 'exists': True})
        else:
            files_info.append({'name': f, 'size': "0 KB", 'modified': "No existe", 'exists': False})
    
    return render_template('admin.html', 
                         fullname=session.get('fullname'),
                         users=users,
                         stats=stats,
                         total_users=stats['total'],
                         files_info=files_info)

@app.route('/api/admin/preview-file/<filename>')
def preview_file(filename):
    if not session.get('logged_in') or not is_admin_user():
        return jsonify({'success': False, 'message': 'No autorizado'}), 403
        
    ALLOWED_CSVS = ['users.csv', 'cursos.csv', 'preguntas.csv', 'puntajes.csv', 'resultados.csv']
    if filename not in ALLOWED_CSVS:
        return jsonify({'success': False, 'message': 'Archivo no permitido'})
        
    if not os.path.exists(filename):
        return jsonify({'success': False, 'message': 'El archivo no existe'})
        
    try:
        df = pd.read_csv(filename, encoding='utf-8')
    except:
        try:
            df = pd.read_csv(filename, encoding='latin-1')
        except Exception as e:
            return jsonify({'success': False, 'message': f'Error leyendo archivo: {str(e)}'})
            
    df = df.fillna('')
            
    with pd.option_context('display.max_rows', None, 'display.max_columns', None, 'display.max_colwidth', None):
        html_table = df.to_html(classes='preview-table', index=False, border=0)
        
    return jsonify({'success': True, 'html': html_table})

@app.route('/api/user/<folio>')
def get_user_details(folio):
    if not session.get('logged_in'):
        return jsonify({'success': False, 'message': 'No autorizado'}), 401
    
    if not is_admin_user():
        return jsonify({'success': False, 'message': 'Acceso denegado'}), 403
    
    try:
        with open(USERS_CSV, 'r', newline='', encoding='utf-8') as f:
            for row in csv.DictReader(f):
                if row['folio'] == folio:
                    return jsonify({'success': True, 'user': row})
        return jsonify({'success': False, 'message': 'Usuario no encontrado'}), 404
    except Exception as e:
        return jsonify({'success': False, 'message': 'Error del servidor'}), 500

@app.route('/api/admin/courses')
def get_admin_courses():
    if not session.get('logged_in'):
        return jsonify({'success': False, 'message': 'No autorizado'}), 401
    
    if not is_admin_user():
        return jsonify({'success': False, 'message': 'Acceso denegado'}), 403
    
    try:
        courses = get_courses_list()
        return jsonify({'success': True, 'courses': courses})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@app.route('/api/admin/update-user/<folio>', methods=['POST'])
def update_user(folio):
    if not session.get('logged_in'):
        return jsonify({'success': False, 'message': 'No autorizado'}), 401
    
    if not is_admin_user():
        return jsonify({'success': False, 'message': 'Acceso denegado'}), 403
    
    try:
        data = request.get_json()
        if not data:
            return jsonify({'success': False, 'message': 'Datos no proporcionados'}), 400
        
        required_fields = ['nombre', 'apellido_paterno', 'apellido_materno', 'email', 'fecha_nacimiento', 'curso']
        for field in required_fields:
            if field not in data or not data[field]:
                return jsonify({'success': False, 'message': f'El campo {field} es obligatorio'}), 400
        
        try:
            datetime.strptime(data['fecha_nacimiento'], '%Y-%m-%d')
        except ValueError:
            return jsonify({'success': False, 'message': 'Formato de fecha inválido. Use YYYY-MM-DD'}), 400
        
        with open(USERS_CSV, 'r', newline='', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                if row['folio'] != folio and row['email'] == data['email']:
                    return jsonify({'success': False, 'message': 'El email ya está registrado por otro usuario'}), 400
        
        user_data = {
            'folio': folio,
            'curso': data['curso'],
            'username': data.get('username', ''),
            'nombre': data['nombre'],
            'apellido_paterno': data['apellido_paterno'],
            'apellido_materno': data['apellido_materno'],
            'email': data['email'],
            'fecha_nacimiento': data['fecha_nacimiento'],
            'password': data.get('password', '')
        }
        
        for i in range(1, 11):
            user_data[f'opcion{i}'] = data.get(f'opcion{i}', '')
        
        user_data['num_opciones_preferidas'] = data.get('num_opciones_preferidas', '0')
        
        success, message = update_user_in_csv(user_data)
        if success:
            return jsonify({'success': True, 'message': message})
        else:
            return jsonify({'success': False, 'message': message}), 500
            
    except Exception as e:
        return jsonify({'success': False, 'message': 'Error del servidor'}), 500

ALLOWED_CSVS = ['users.csv', 'cursos.csv', 'preguntas.csv', 'puntajes.csv', 'resultados.csv']

@app.route('/api/admin/export-file/<filename>')
def export_specific_file(filename):
    if not session.get('logged_in'):
        return jsonify({'success': False, 'message': 'No autorizado'}), 401
    
    if not is_admin_user():
        return jsonify({'success': False, 'message': 'Acceso denegado'}), 403
        
    if filename not in ALLOWED_CSVS:
        return jsonify({'success': False, 'message': 'Archivo no permitido'}), 400
        
    if not os.path.exists(filename):
        return jsonify({'success': False, 'message': 'El archivo no existe en el servidor'}), 404
        
    try:
        return send_file(filename, as_attachment=True, download_name=filename)
    except Exception as e:
        return jsonify({'success': False, 'message': 'Error al exportar el archivo'}), 500

@app.route('/api/admin/import-file/<filename>', methods=['POST'])
def import_specific_file(filename):
    if not session.get('logged_in'):
        return jsonify({'success': False, 'message': 'No autorizado'}), 401
    
    if not is_admin_user():
        return jsonify({'success': False, 'message': 'Acceso denegado'}), 403
        
    if filename not in ALLOWED_CSVS:
        return jsonify({'success': False, 'message': 'Archivo no permitido'}), 400
        
    try:
        if 'file' not in request.files:
            return jsonify({'success': False, 'message': 'No se encontró el archivo'}), 400
            
        file = request.files['file']
        if file.filename == '':
            return jsonify({'success': False, 'message': 'No se seleccionó ningún archivo'}), 400
            
        if not file.filename.endswith('.csv'):
            return jsonify({'success': False, 'message': 'El archivo debe ser un formato CSV'}), 400
            
        if os.path.exists(filename):
            import shutil
            backup_path = f"{filename}.backup_{get_now_mexico().strftime('%Y%m%d_%H%M%S')}"
            shutil.copy2(filename, backup_path)
            
        file.save(filename)
        return jsonify({'success': True, 'message': f'Archivo {filename} actualizado exitosamente.'})
        
    except Exception as e:
        return jsonify({'success': False, 'message': f'Error al importar: {str(e)}'}), 500

@app.route('/api/admin/export-users')
def export_users():
    if not session.get('logged_in'):
        return jsonify({'success': False, 'message': 'No autorizado'}), 401
    
    if not is_admin_user():
        return jsonify({'success': False, 'message': 'Acceso denegado'}), 403
    
    try:
        return send_file(USERS_CSV, mimetype='text/csv', as_attachment=True, download_name='users.csv')
    except Exception as e:
        return jsonify({'success': False, 'message': 'Error al exportar usuarios'}), 500

@app.route('/api/admin/import-users', methods=['POST'])
def import_users():
    if not session.get('logged_in'):
        return jsonify({'success': False, 'message': 'No autorizado'}), 401
    
    if not is_admin_user():
        return jsonify({'success': False, 'message': 'Acceso denegado'}), 403
    
    try:
        if 'file' not in request.files:
            return jsonify({'success': False, 'message': 'No se encontró el archivo'}), 400
        
        file = request.files['file']
        if file.filename == '':
            return jsonify({'success': False, 'message': 'No se seleccionó ningún archivo'}), 400
        
        if not file.filename.endswith('.csv'):
            return jsonify({'success': False, 'message': 'El archivo debe ser CSV'}), 400
        
        content = file.read().decode('utf-8')
        csv_reader = csv.DictReader(io.StringIO(content))
        
        required_columns = ['folio', 'curso', 'username', 'nombre', 'apellido_paterno', 
                           'apellido_materno', 'email', 'fecha_nacimiento', 'password']
        
        actual_columns = csv_reader.fieldnames
        missing_columns = [col for col in required_columns if col not in actual_columns]
        
        if missing_columns:
            return jsonify({'success': False, 'message': f'Columnas faltantes: {", ".join(missing_columns)}'}), 400
        
        users = []
        for row in csv_reader:
            for field in required_columns:
                if not row.get(field):
                    return jsonify({'success': False, 'message': f'Fila con folio {row.get("folio", "N/A")} tiene el campo {field} vacío'}), 400
            
            try:
                datetime.strptime(row['fecha_nacimiento'], '%Y-%m-%d')
            except ValueError:
                try:
                    datetime.strptime(row['fecha_nacimiento'], '%d/%m/%Y')
                    dt = datetime.strptime(row['fecha_nacimiento'], '%d/%m/%Y')
                    row['fecha_nacimiento'] = dt.strftime('%Y-%m-%d')
                except:
                    return jsonify({'success': False, 'message': f'Formato de fecha inválido en fila con folio {row["folio"]}'}), 400
            
            users.append(row)
        
        backup_path = f"{USERS_CSV}.backup_{get_now_mexico().strftime('%Y%m%d_%H%M%S')}"
        if os.path.exists(USERS_CSV):
            import shutil
            shutil.copy2(USERS_CSV, backup_path)
        
        with open(USERS_CSV, 'w', newline='', encoding='utf-8') as f:
            all_columns = required_columns + [f'opcion{i}' for i in range(1, 11)] + ['num_opciones_preferidas']
            writer = csv.DictWriter(f, fieldnames=all_columns)
            writer.writeheader()
            
            for user in users:
                for col in all_columns:
                    if col not in user:
                        user[col] = ''
                writer.writerow(user)
        
        return jsonify({'success': True, 'message': f'Importados {len(users)} usuarios exitosamente'})
        
    except Exception as e:
        return jsonify({'success': False, 'message': f'Error al importar: {str(e)}'}), 500

@app.route('/api/admin/save-photo', methods=['POST'])
def save_photo():
    if not session.get('logged_in'):
        return jsonify({'success': False, 'message': 'No autorizado'}), 401
    
    if not is_admin_user():
        return jsonify({'success': False, 'message': 'Acceso denegado'}), 403
        
    try:
        data = request.get_json()
        folio = data.get('folio')
        curso = data.get('curso')
        image_data = data.get('image')
        
        if not all([folio, curso, image_data]):
            return jsonify({'success': False, 'message': 'Datos incompletos'}), 400
            
        if ',' in image_data:
            header, encoded = image_data.split(',', 1)
        else:
            encoded = image_data
            
        curso_clean = curso.strip().replace(' ', '_')
        filename = f"{folio}_{curso_clean}.png"
        file_path = os.path.join(IMG_PERFIL_DIR, filename)
        
        with open(file_path, "wb") as fh:
            fh.write(base64.b64decode(encoded))
            
        return jsonify({'success': True, 'message': 'Foto guardada correctamente'})
        
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@app.route('/escuelas', methods=['GET', 'POST'])
def escuelas():
    if not session.get('logged_in'): return redirect(url_for('index'))
    
    email = session.get('user')
    valid_session_id = get_user_session_id(email)
    if valid_session_id and valid_session_id != session.get('session_id'):
        session.clear(); return redirect(url_for('index'))

    user_data = get_user_by_email(email)
    curso = user_data['curso']
    folio = user_data['folio']
    
    data_escuelas = get_escuelas_por_curso(curso)
    instituciones = get_instituciones_unicas(data_escuelas)
    
    opciones_existentes, num_pref = cargar_opciones_escuelas(curso, folio)
    
    is_licenciatura = 'LICENCIATURA' in curso.upper()
    is_ecoems = 'ECOEMS' in curso.upper()
    
    mensaje = None
    pdf_b64 = None
    pdf_name = None

    if request.method == 'POST':
        num_opciones_form = request.form.get('num_opciones_hidden')
        opciones_to_save = []
        
        contexto_doc = {
            'folio_alumno': folio,
            'nombre_alumno': session.get('fullname')
        }
        
        for i in range(1, 11):
            val_formatted = ""
            val_csv = ""
            
            if is_licenciatura:
                inst = request.form.get(f'escuela_{i}', '').strip()
                area = request.form.get(f'area_{i}', '').strip()
                carrera = request.form.get(f'carrera_{i}', '').strip()
                plant = request.form.get(f'plantel_{i}', '').strip()
                
                if inst and area and carrera and plant:
                    val_csv = f"{inst}|{area}|{carrera}|{plant}"
                    val_formatted = f"{inst} - {carrera} ({plant})"
                else:
                    val_csv = ""
                    val_formatted = "---"
            else:
                inst = request.form.get(f'escuela_{i}', '').strip()
                plant = request.form.get(f'plantel_{i}', '').strip()
                if inst and plant: 
                    val_csv = f"{inst}|{plant}"
                    val_formatted = f"{inst} - {plant}"
                else:
                    val_csv = ""
                    val_formatted = "---"
            
            opciones_to_save.append(val_csv)
            contexto_doc[f'opcion{i}'] = val_formatted
        
        success, msg = guardar_opciones_escuelas(curso, folio, opciones_to_save, num_opciones_form)
        mensaje = msg
        
        if success and curso in SELECCION_TEMPLATE_MAP:
            try:
                template_file = SELECCION_TEMPLATE_MAP[curso]
                template_path = os.path.join(PLANTILLAS_DIR, template_file)
                
                if os.path.exists(template_path):
                    doc = DocxTemplate(template_path)
                    doc.render(contexto_doc)
                    
                    folder_out = SELECCION_DIR_MAP[curso]
                    target_dir = os.path.join(REGISTROS_DIR, folder_out)
                    
                    base_name = f"{folio}_{curso}_documento_a"
                    docx_path = os.path.join(target_dir, f"{base_name}.docx")
                    pdf_filename = f"{base_name}.pdf"
                    pdf_path = os.path.join(target_dir, pdf_filename)
                    
                    doc.save(docx_path)
                    convert_docx_to_pdf(docx_path, pdf_path)
                    
                    with open(pdf_path, "rb") as f:
                        pdf_b64 = base64.b64encode(f.read()).decode('utf-8')
                    
                    pdf_name = pdf_filename
            except Exception as e:
                print(f"Error generando Documento A: {e}")

        opciones_existentes, num_pref = cargar_opciones_escuelas(curso, folio)

    return render_template('escuelas.html', 
                           fullname=session.get('fullname'), curso=curso,
                           instituciones_unicas=instituciones, mensaje=mensaje,
                           opciones_existentes=opciones_existentes, num_opciones_pref=num_pref,
                           is_licenciatura=is_licenciatura, is_ecoems=is_ecoems,
                           pdf_b64=pdf_b64, pdf_name=pdf_name)

@app.route('/api/planteles_por_escuela')
def api_planteles_por_escuela():
    institucion = request.args.get('institucion')
    curso = session.get('curso')
    data = get_escuelas_por_curso(curso)
    filtered = get_planteles_por_institucion(institucion, data)
    return jsonify({'success': True, 'planteles': filtered})

@app.route('/api/ordenar_automatico', methods=['POST'])
def api_ordenar_automatico():
    return jsonify({'success': False, 'message': 'Funcionalidad en mantenimiento.'})

@app.route('/test')
def test():
    if not session.get('logged_in'): return redirect(url_for('index'))
    email = session.get('user')
    valid_session_id = get_user_session_id(email)
    if valid_session_id and valid_session_id != session.get('session_id'):
        session.clear()
        return redirect(url_for('index'))
    next_url = request.args.get('next')
    return render_template('test.html', fullname=session.get('fullname', 'USUARIO'), next=next_url or url_for('launcher'))

@app.route('/mark-devices-verified', methods=['POST'])
def mark_devices_verified():
    if not session.get('logged_in'):
        return jsonify({'success': False, 'message': 'No autorizado'})
    session['devices_verified'] = True
    return jsonify({'success': True, 'message': 'Dispositivos verificados'})

@app.route('/examen')
def examen():
    if not session.get('logged_in'): return redirect(url_for('index'))
    email = session.get('user')
    valid_session_id = get_user_session_id(email)
    if valid_session_id and valid_session_id != session.get('session_id'):
        session.clear(); return redirect(url_for('index'))
    
    curso = session.get('curso')
    materia = request.args.get('materia')

    if not curso or not materia: return redirect(url_for('launcher'))
    if not session.get('devices_verified'):
        return redirect(url_for('test', next=url_for('examen', materia=materia)))

    try:
        try:
            df_c = pd.read_csv(COURSES_CSV, encoding='utf-8-sig', engine='python')
        except:
            df_c = pd.read_csv(COURSES_CSV, encoding='latin-1', engine='python')
            
        df_c.columns = df_c.columns.str.strip().str.lower()
        
        curso_norm = str(curso).strip().upper()
        materia_norm = str(materia).strip().upper()
        
        mask = (df_c['curso'].astype(str).str.strip().str.upper() == curso_norm) & \
               (df_c['materia'].astype(str).str.strip().str.upper() == materia_norm)
               
        df_filtrado = df_c[mask]
        
        if df_filtrado.empty:
            return redirect(url_for('launcher'))
            
        row = df_filtrado.iloc[0]

        fecha_str = str(row.get('fecha_disponible', '')).strip()
        final_str = str(row.get('horario_final', '')).strip()
        inicio_str = str(row.get('horario_inicio', '')).strip()
        
        try:
            exam_date = datetime.strptime(fecha_str, '%Y-%m-%d').date()
        except ValueError:
            try:
                exam_date = datetime.strptime(fecha_str, '%d/%m/%Y').date()
            except:
                exam_date = get_now_mexico().date()

        end_time_obj = datetime.strptime(final_str, '%H:%M:%S').time()
        exam_end_datetime = datetime.combine(exam_date, end_time_obj)
        
        now = get_now_mexico()
        remaining_seconds = (exam_end_datetime - now).total_seconds()
        
        if remaining_seconds < 0:
            remaining_seconds = 0
            
        details = {
            'name': f"{curso} - {materia}",
            'date': fecha_str,
            'start_time': inicio_str,
            'end_time': final_str,
            'total_seconds': int(remaining_seconds) 
        }

        df_p = pd.read_csv(QUESTIONS_CSV, encoding='utf-8', engine='python')
        df_p.columns = df_p.columns.str.strip()
        q_df = df_p[
            (df_p['Curso'].astype(str).str.strip().str.upper() == curso_norm) & 
            (df_p['Materia'].astype(str).str.strip().str.upper() == materia_norm)
        ].sort_values(by='Pregunta_número')
        
        q_df = q_df.fillna('')
        questions = q_df.to_dict('records')
        is_admin = is_admin_user()

        return render_template('examen.html', fullname=session.get('fullname'), questions=questions, exam_details=details, is_admin=is_admin)
        
    except Exception as e:
        return redirect(url_for('launcher'))

@app.route('/api/save-exam-results', methods=['POST'])
def save_exam_results_api():
    if not session.get('logged_in'):
        return jsonify({'success': False, 'message': 'No autorizado'}), 401
    
    try:
        data = request.get_json()
        if not data:
            return jsonify({'success': False, 'message': 'Datos no proporcionados'}), 400
        
        folio = data.get('folio')
        curso = data.get('curso')
        materia = data.get('materia')
        respuestas = data.get('respuestas')
        
        if not all([folio, curso, materia, respuestas]):
            return jsonify({'success': False, 'message': 'Datos incompletos'}), 400
        
        success, message = save_exam_results(folio, curso, materia, respuestas)
        
        if success:
            return jsonify({'success': True, 'message': message})
        else:
            return jsonify({'success': False, 'message': message}), 500
            
    except Exception as e:
        return jsonify({'success': False, 'message': 'Error del servidor'}), 500
    
@app.route('/resultados')
def resultados():
    if not session.get('logged_in'): return redirect(url_for('index'))
    materia_actual = request.args.get('materia')
    
    is_admin = is_admin_user()
    
    if not materia_actual and not is_admin: 
        return redirect(url_for('launcher'))
        
    admin_data = {}
    if is_admin:
        try:
            all_users = get_all_users()
            try:
                df_c = pd.read_csv(COURSES_CSV, encoding='utf-8-sig', engine='python')
            except:
                df_c = pd.read_csv(COURSES_CSV, encoding='latin-1', engine='python')
            
            df_c.columns = df_c.columns.str.strip().str.lower()
            
            cursos_dict = {}
            col_curso = next((c for c in df_c.columns if c == 'curso'), None)
            col_mat = next((c for c in df_c.columns if c == 'materia'), None)

            if col_curso and col_mat:
                for curso in df_c[col_curso].dropna().unique():
                    c_str = str(curso).strip()
                    if c_str not in cursos_dict:
                        cursos_dict[c_str] = {'materias': [], 'usuarios': []}
                    
                    materias = df_c[df_c[col_curso] == curso][col_mat].dropna().unique().tolist()
                    cursos_dict[c_str]['materias'] = [str(m).strip() for m in materias]
            
            for u in all_users:
                c_str = str(u.get('curso', '')).strip()
                if c_str in cursos_dict:
                    cursos_dict[c_str]['usuarios'].append({
                        'folio': u.get('folio'),
                        'nombre_completo': f"{u.get('nombre')} {u.get('apellido_paterno')} {u.get('apellido_materno')}".strip()
                    })
            
            admin_data = cursos_dict
        except Exception as e:
            print(f"Error cargando admin data en resultados: {e}")
    
    return render_template('resultados.html', 
                         fullname=session.get('fullname'), 
                         curso=session.get('curso'),
                         materia=materia_actual or '',
                         is_admin=is_admin,
                         admin_data=admin_data)

# =======================================================
# NUEVA LÓGICA DE DESCARGA MASIVA Y RANKINGS
# =======================================================

@app.route('/api/get-all-results-bulk')
def get_all_results_bulk():
    if not session.get('logged_in'):
        return jsonify({'success': False, 'message': 'No autorizado'}), 401

    is_admin = is_admin_user()
    user_folio = str(session.get('folio'))

    try:
        # 1. Leer TODOS los usuarios
        df_users = pd.read_csv(USERS_CSV, encoding='utf-8', dtype={'folio': str})
        df_users['folio'] = df_users['folio'].astype(str).str.strip()
        df_users['curso'] = df_users['curso'].astype(str).str.strip()
        user_courses = df_users.set_index('folio')['curso'].to_dict()

        # 2. Leer Cursos y Tiempos
        try:
            df_c = pd.read_csv(COURSES_CSV, encoding='utf-8-sig', engine='python')
        except:
            df_c = pd.read_csv(COURSES_CSV, encoding='latin-1', engine='python')
        df_c.columns = df_c.columns.str.strip().str.lower()
        
        now = get_now_mexico()
        course_status = {}
        results_available = {} # NUEVO: Control de disponibilidad de resultados
        materia_original_names = {} 
        
        if 'curso' in df_c.columns and 'materia' in df_c.columns:
            for _, row in df_c.iterrows():
                c_orig = str(row.get('curso', '')).strip()
                m_orig = str(row.get('materia', '')).strip()
                if not c_orig or not m_orig: continue
                
                c_up = c_orig.upper()
                m_up = m_orig.upper()
                materia_original_names[m_up] = m_orig
                
                # Tiempo del examen
                fecha_str = str(row.get('fecha_disponible', '')).strip()
                final_str = str(row.get('horario_final', '')).strip()
                
                try:
                    try: exam_date = datetime.strptime(fecha_str, '%Y-%m-%d').date()
                    except: exam_date = datetime.strptime(fecha_str, '%d/%m/%Y').date()
                    
                    end_time_obj = datetime.strptime(final_str, '%H:%M:%S').time()
                    exam_end_datetime = datetime.combine(exam_date, end_time_obj)
                    
                    status_tiempo = 'pasado' if now > exam_end_datetime else 'proximo'
                except:
                    status_tiempo = 'proximo'
                    
                course_status[(c_up, m_up)] = status_tiempo

                # --- NUEVO: Validar tiempo de los resultados ---
                fecha_res_str = str(row.get('fecha_resultado', '')).strip()
                hora_res_str = str(row.get('horario_resultado', '')).strip()
                try:
                    try: res_date = datetime.strptime(fecha_res_str, '%Y-%m-%d').date()
                    except: res_date = datetime.strptime(fecha_res_str, '%d/%m/%Y').date()
                    
                    res_time_obj = datetime.strptime(hora_res_str, '%H:%M:%S').time() if hora_res_str else time(0,0)
                    res_datetime = datetime.combine(res_date, res_time_obj)
                    
                    res_disp = (now >= res_datetime)
                except:
                    res_disp = True  # Si no hay fecha programada, por defecto están disponibles
                    
                results_available[(c_up, m_up)] = res_disp

        # 3. Leer Preguntas
        preguntas_extra = {}
        materia_totals = {}
        try:
            df_p = pd.read_csv(QUESTIONS_CSV, encoding='utf-8', engine='python')
            df_p.columns = df_p.columns.str.strip()
            df_p = df_p.fillna('')
            for _, p_row in df_p.iterrows():
                c = str(p_row.get('Curso', '')).strip().upper()
                m = str(p_row.get('Materia', '')).strip().upper()
                num = str(p_row.get('Pregunta_número', '')).strip()
                
                key = f"{c}_{m}_{num}"
                preguntas_extra[key] = p_row.to_dict()
                
                mat_key = (c, m)
                materia_totals[mat_key] = materia_totals.get(mat_key, 0) + 1
        except Exception as e:
            pass

        # 4. Leer Resultados reales
        if os.path.exists(RESULTADOS_CSV):
            df_full = pd.read_csv(RESULTADOS_CSV, encoding='utf-8', dtype={'folio': str})
            df_full = df_full.fillna('')
            df_full['folio'] = df_full['folio'].astype(str).str.strip()
            
            df_full['curso_norm'] = df_full['curso'].astype(str).str.strip().str.upper()
            df_full['materia_norm'] = df_full['materia'].astype(str).str.strip().str.upper()
            
            def normalizar_opcion_df(texto):
                t = str(texto).lower().strip()
                if 'respuesta_a' in t or t == 'a': return 'A'
                if 'respuesta_b' in t or t == 'b': return 'B'
                if 'respuesta_c' in t or t == 'c': return 'C'
                if 'respuesta_d' in t or t == 'd': return 'D'
                return ''

            df_full['sel_norm'] = df_full['Respuesta_seleccionada'].apply(normalizar_opcion_df)
            df_full['cor_norm'] = df_full['Respuesta_correcta'].apply(normalizar_opcion_df)
            df_full['is_correct'] = ((df_full['sel_norm'] == df_full['cor_norm']) & (df_full['sel_norm'] != '')).astype(int)
        else:
            df_full = pd.DataFrame(columns=['folio', 'curso_norm', 'materia_norm', 'is_correct'])

        # --- RANKINGS ---
        if not df_full.empty:
            scores_mat = df_full.groupby(['curso_norm', 'materia_norm', 'folio'])['is_correct'].sum().reset_index()
            scores_mat['rank'] = scores_mat.groupby(['curso_norm', 'materia_norm'])['is_correct'].rank(method='min', ascending=False).astype(int)
            total_mat = scores_mat.groupby(['curso_norm', 'materia_norm'])['folio'].nunique().reset_index(name='total_users')
            scores_mat = pd.merge(scores_mat, total_mat, on=['curso_norm', 'materia_norm'])
            dict_ranks_mat = scores_mat.set_index(['curso_norm', 'materia_norm', 'folio']).to_dict('index')
        else:
            dict_ranks_mat = {}

        df_glob_scores = df_users[['folio']].copy()
        df_glob_scores['curso_norm'] = df_users['curso'].astype(str).str.strip().str.upper()
        if not df_full.empty:
            user_sums = df_full.groupby('folio')['is_correct'].sum().reset_index()
            df_glob_scores = pd.merge(df_glob_scores, user_sums, on='folio', how='left')
            df_glob_scores['is_correct'] = df_glob_scores['is_correct'].fillna(0)
        else:
            df_glob_scores['is_correct'] = 0

        df_glob_scores['rank_global'] = df_glob_scores.groupby('curso_norm')['is_correct'].rank(method='min', ascending=False).astype(int)
        total_glob = df_glob_scores.groupby('curso_norm')['folio'].nunique().reset_index(name='total_users_glob')
        df_glob_scores = pd.merge(df_glob_scores, total_glob, on='curso_norm')
        dict_ranks_glob = df_glob_scores.set_index(['curso_norm', 'folio']).to_dict('index')
        # -----------------

        folios_to_process = list(df_users['folio']) if is_admin else [user_folio]
        bulk_data = {}

        for f_val in folios_to_process:
            c_val_orig = user_courses.get(f_val, '')
            if not c_val_orig: continue
            
            c_val_upper = c_val_orig.upper()
            materias_del_curso_up = [m for (c, m) in course_status.keys() if c == c_val_upper]
            
            if not materias_del_curso_up and not df_full.empty:
                materias_del_curso_up = df_full[df_full['curso_norm'] == c_val_upper]['materia_norm'].unique().tolist()

            user_data_out = {}
            
            for m_val_upper in materias_del_curso_up:
                m_orig = materia_original_names.get(m_val_upper, m_val_upper.title())
                
                if not df_full.empty:
                    df_user_mat = df_full[(df_full['folio'] == f_val) & (df_full['curso_norm'] == c_val_upper) & (df_full['materia_norm'] == m_val_upper)]
                else:
                    df_user_mat = pd.DataFrame()

                tot_q = materia_totals.get((c_val_upper, m_val_upper), 0)
                status_tiempo = course_status.get((c_val_upper, m_val_upper), 'proximo')
                res_disp = results_available.get((c_val_upper, m_val_upper), True)

                # Si es administrador, siempre puede ver los resultados sin importar la fecha
                if is_admin:
                    res_disp = True

                details = []
                correctas = 0
                incorrectas = 0
                sin_responder = 0
                
                # === ASIGNAR ESTADO EXACTO DEL EXAMEN ===
                if not df_user_mat.empty:
                    if res_disp:
                        estado_examen = 'presentado'
                    else:
                        estado_examen = 'resultados_pendientes' # Presentó, pero oculto
                else:
                    if status_tiempo == 'pasado':
                        if res_disp:
                            estado_examen = 'no_presentado'
                        else:
                            estado_examen = 'resultados_pendientes' # Oculto hasta fecha
                    else:
                        estado_examen = 'proximo'

                # Llenar datos solo si es presentado y la fecha de publicación ya llegó
                if estado_examen == 'presentado':
                    for _, row in df_user_mat.iterrows():
                        pregunta_num = str(row.get('Pregunta_número')).strip()
                        q_key = f"{c_val_upper}_{m_val_upper}_{pregunta_num}"
                        extra = preguntas_extra.get(q_key, {})

                        def get_val(r, e, key):
                            v = str(r.get(key, '')).strip()
                            return v if v else str(e.get(key, '')).strip()

                        pregunta_txt = get_val(row, extra, 'Pregunta')
                        if not pregunta_txt: pregunta_txt = "Pregunta sin texto"
                        
                        sel_letra = str(row.get('sel_norm', '')).strip()
                        corr_letra = str(row.get('cor_norm', '')).strip()
                        
                        status = 'incorrecta'
                        if not sel_letra:
                            status = 'sin_responder'
                            sin_responder += 1
                        elif sel_letra == corr_letra:
                            status = 'correcta'
                            correctas += 1
                        else:
                            status = 'incorrecta'
                            incorrectas += 1

                        details.append({
                            'numero': pregunta_num,
                            'pregunta': pregunta_txt,
                            'opciones': {
                                'A': get_val(row, extra, 'Respuesta_a'),
                                'B': get_val(row, extra, 'Respuesta_b'),
                                'C': get_val(row, extra, 'Respuesta_c'),
                                'D': get_val(row, extra, 'Respuesta_d')
                            },
                            'Parrfafo': str(extra.get('Parrfafo', '')),
                            'Img_Parrafo': str(extra.get('Img_Parrafo', '')),
                            'Pregunta_Parrafo': str(extra.get('Pregunta_Parrafo', '')),
                            'Img_Respuesta_a': str(extra.get('Img_Respuesta_a', '')),
                            'Img_Respuesta_b': str(extra.get('Img_Respuesta_b', '')),
                            'Img_Respuesta_c': str(extra.get('Img_Respuesta_c', '')),
                            'Img_Respuesta_d': str(extra.get('Img_Respuesta_d', '')),
                            'seleccionada': sel_letra,
                            'correcta': corr_letra,
                            'status': status
                        })
                        
                    try: details.sort(key=lambda x: int(x['numero']) if str(x['numero']).isdigit() else 0)
                    except: pass
                    
                    total_preguntas = len(details)
                    tot_q = total_preguntas

                elif estado_examen == 'resultados_pendientes':
                    total_preguntas = tot_q
                elif estado_examen == 'no_presentado':
                    total_preguntas = tot_q
                    sin_responder = tot_q 
                else: # proximo
                    total_preguntas = tot_q
                        
                calificacion = (correctas / total_preguntas * 10) if total_preguntas > 0 else 0

                # === CÁLCULO DE POSICIONES ===
                rank_info = dict_ranks_mat.get((c_val_upper, m_val_upper, f_val), {'rank': '-', 'total_users': '-'})
                if estado_examen != 'presentado':
                    pos_mat = "-"
                else:
                    pos_mat = f"{rank_info['rank']} / {rank_info['total_users']}"

                rank_glob_info = dict_ranks_glob.get((c_val_upper, f_val), {'rank_global': '-', 'total_users_glob': '-'})
                if not res_disp:
                    pos_glob = "-"
                else:
                    pos_glob = f"{rank_glob_info['rank_global']} / {rank_glob_info['total_users_glob']}"

                summary = {
                    'total': total_preguntas,
                    'correctas': correctas,
                    'incorrectas': incorrectas,
                    'sin_responder': sin_responder,
                    'calificacion': round(calificacion, 1),
                    'posicion_materia': pos_mat,
                    'posicion_global': pos_glob,
                    'estado_examen': estado_examen 
                }

                user_data_out[m_orig] = {'summary': summary, 'details': details}

            if is_admin:
                bulk_data[f_val] = user_data_out
            else:
                bulk_data = user_data_out 

        return jsonify({'success': True, 'data': bulk_data})

    except Exception as e:
        print(f"Error procesando bulk load: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'message': f'Error interno: {str(e)}'}), 500

@app.route('/logout')
def logout():
    remove_active_session(session.get('user'))
    session.clear()
    return redirect(url_for('index'))

class StandaloneApplication(BaseApplication):
    def __init__(self, app, options=None):
        self.options = options or {}
        self.application = app
        super().__init__()

    def load_config(self):
        config = {key: value for key, value in self.options.items()
                  if key in self.cfg.settings and value is not None}
        for key, value in config.items():
            self.cfg.set(key.lower(), value)

    def load(self):
        return self.application

if __name__ == '__main__':
    ssl_config = generate_self_signed_cert()
    ctx = (ssl_config[0], ssl_config[1]) if ssl_config != 'adhoc' else 'adhoc'
    
    if '--dev' in sys.argv:
        print("--- MODO DEVELOPER (FLASK) ---")
        app.run(host='0.0.0.0', port=8000, debug=True, ssl_context=ctx)
    else:
        print("--- MODO DEPLOY (GUNICORN) ---")
        cmd = [
            sys.executable, '-m', 'gunicorn',
            '-w', '3',                
            '-b', '0.0.0.0:8000',     
            '--timeout', '120',       
            '--access-logfile', '-',  
            '--error-logfile', '-',   
            'app:app'                 
        ]
        
        if ssl_config != 'adhoc':
            cmd.extend(['--certfile', ssl_config[0]])
            cmd.extend(['--keyfile', ssl_config[1]])
            
        os.execv(sys.executable, cmd)