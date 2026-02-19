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
from docx2pdf import convert
import tempfile
import base64
import locale
import re
import io
from gunicorn.app.base import BaseApplication
import subprocess
import signal
import pytz

app = Flask(__name__)
app.secret_key = 'clave_secreta_caep_simulador'

# --- ZONA HORARIA ---
MEXICO_TZ = pytz.timezone('America/Mexico_City')

def get_now_mexico():
    """
    Obtiene la hora actual exacta de México y le quita el tzinfo.
    Esto evita el error: "can't compare offset-naive and offset-aware datetimes"
    """
    return datetime.now(MEXICO_TZ).replace(tzinfo=None)

# --- CONSTANTES Y ARCHIVOS ---
USERS_CSV = 'users.csv'
COURSES_CSV = 'cursos.csv'
QUESTIONS_CSV = 'preguntas.csv'
PUNTAJES_CSV = 'puntajes.csv'
RESULTADOS_CSV = 'resultados.csv'

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

# Diccionario para controlar sesiones activas
active_sessions = {}

def init_csv():
    """Inicializa archivos CSV y carpetas necesarias."""
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
    
    # Inicializar resultados.csv si no existe
    if not os.path.exists(RESULTADOS_CSV):
        with open(RESULTADOS_CSV, 'w', newline='', encoding='utf-8') as file:
            writer = csv.writer(file)
            header = ['folio', 'curso', 'materia', 'Pregunta_número', 'Pregunta',
                     'Respuesta_a', 'Respuesta_b', 'Respuesta_c', 'Respuesta_d',
                     'Respuesta_seleccionada', 'Respuesta_correcta']
            writer.writerow(header)
    
    if not os.path.exists(PLANTILLAS_DIR): os.makedirs(PLANTILLAS_DIR)
    if not os.path.exists(REGISTROS_DIR): os.makedirs(REGISTROS_DIR)
    if not os.path.exists(IMG_PERFIL_DIR): os.makedirs(IMG_PERFIL_DIR)
        
    all_folders = list(REGISTROS_MAP.values()) + list(COMPROBANTES_MAP.values())
    for folder_name in SELECCION_DIR_MAP.values():
            full_path = os.path.join(REGISTROS_DIR, folder_name)
            if not os.path.exists(full_path): os.makedirs(full_path)

# --- FUNCIONES DE UTILIDAD ---

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

def is_user_logged_in(email): return email in active_sessions
def add_active_session(email, session_id): active_sessions[email] = {'session_id': session_id, 'login_time': get_now_mexico().strftime("%Y-%m-%d %H:%M:%S")}
def remove_active_session(email): 
    if email in active_sessions: del active_sessions[email]

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
        print(f"Error status examen: {e}")
        return "Error Datos", False

def check_exam_taken(folio, curso, materia):
    """Verifica si el usuario ya realizó el examen en resultados.csv"""
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
        print(f"Error checking exam taken: {e}")
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
        print(f"Error al leer usuarios: {e}")
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
        print(f"Error al obtener estadísticas: {e}")
        return {'total': 0, 'por_curso': {}, 'con_opciones': 0, 'sin_opciones': 0}

def get_admin_user():
    try:
        with open(USERS_CSV, 'r', newline='', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            rows = list(reader)
            if rows:
                return rows[0]
    except Exception as e:
        print(f"Error al obtener usuario admin: {e}")
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
        print(f"Error al obtener cursos: {e}")
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
        print(f"Error al actualizar usuario: {e}")
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
            
            if letra_lower == 'a':
                valor_a_guardar = "Respuesta_a"
            elif letra_lower == 'b':
                valor_a_guardar = "Respuesta_b"
            elif letra_lower == 'c':
                valor_a_guardar = "Respuesta_c"
            elif letra_lower == 'd':
                valor_a_guardar = "Respuesta_d"
            else:
                valor_a_guardar = "" 

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
        print(f"Error al guardar resultados: {e}")
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
                    convert(doc_path, pdf_path)
                    
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
                    convert(doc_path, pdf_path)
                    
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
        print(f"Error api_courses: {e}")
        return jsonify({})

@app.route('/launcher')
def launcher():
    if not session.get('logged_in'): return redirect(url_for('index'))
    return render_template('launcher.html', user=session['user'], fullname=session.get('fullname'), curso=session.get('curso'))

@app.route('/perfil')
def perfil():
    if not session.get('logged_in'): return redirect(url_for('index'))
    
    user_data = get_user_by_email(session['user'])
    admin_user = get_admin_user()
    is_admin = user_data.get('folio') == admin_user.get('folio') if admin_user else False
    
    # Foto de perfil
    curso_clean = user_data['curso'].strip().replace(' ', '_')
    filename = f"{user_data['folio']}_{curso_clean}.png"
    full_path_img = os.path.join(IMG_PERFIL_DIR, filename)
    
    if os.path.exists(full_path_img):
        import time
        foto_url = url_for('static', filename=f'img/perfil/{filename}', v=int(time.time()))
    else:
        foto_url = url_for('static', filename='img/foto_perfil.png')

    # --- MATERIAL DE TRABAJO ---
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

    # --- DOCUMENTACIÓN DINÁMICA ---
    tipo_curso = 'ecoems' if 'ECOEMS' in curso_str else 'licenciatura'
    
    username = user_data.get('username', '')
    folio = user_data.get('folio', '')

    docs_to_search = [
        {
            'label': 'Registro',
            'folder': f'registros_{tipo_curso}', 
            'pattern': f'registro_*_{username}.pdf' 
        },
        {
            'label': 'Comprobante de Registro',
            'folder': f'comprobantes_{tipo_curso}',
            'pattern': f'comprobante_*_{username}.pdf'
        },
        {
            'label': 'Documento A',
            'folder': f'{tipo_curso}_documento_a',
            'pattern': f'{folio}_*_documento_a.pdf'
        },
        {
            'label': 'Documento B',
            'folder': f'{tipo_curso}_documento_b',
            'pattern': f'{folio}_*_documento_b.pdf'
        },
        {
            'label': 'Documento C',
            'folder': f'{tipo_curso}_documento_c',
            'pattern': f'{folio}_*_documento_c.pdf'
        }
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
            
            # Construir ruta relativa y normalizar separadores
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
        # Limpiar ruta: eliminar posibles barras iniciales y normalizar
        ruta_relativa = ruta_relativa.lstrip('/').replace('\\', '/')
        
        # Determinar directorio base
        if ruta_relativa.startswith(REGISTROS_DIR) or ruta_relativa.startswith('registros'):
            directorio_base = app.root_path  # Raíz del proyecto
        else:
            directorio_base = app.static_folder

        ruta_completa = os.path.join(directorio_base, ruta_relativa)
        
        if not os.path.exists(ruta_completa):
            print(f"ERROR: Archivo no encontrado en: {ruta_completa}")
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
        print(f"ERROR DESCARGA: {e}")
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
    
    return render_template('admin.html', 
                         fullname=session.get('fullname'),
                         users=users,
                         stats=stats,
                         total_users=stats['total'])

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
        print(f"Error al obtener detalles del usuario: {e}")
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
        print(f"Error al obtener cursos: {e}")
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
        print(f"Error al actualizar usuario: {e}")
        return jsonify({'success': False, 'message': 'Error del servidor'}), 500

@app.route('/api/admin/export-users')
def export_users():
    if not session.get('logged_in'):
        return jsonify({'success': False, 'message': 'No autorizado'}), 401
    
    if not is_admin_user():
        return jsonify({'success': False, 'message': 'Acceso denegado'}), 403
    
    try:
        return send_file(
            USERS_CSV,
            mimetype='text/csv',
            as_attachment=True,
            download_name=f'usuarios_export_{get_now_mexico().strftime("%Y%m%d_%H%M%S")}.csv'
        )
    except Exception as e:
        print(f"Error al exportar usuarios: {e}")
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
        print(f"Error al importar usuarios: {e}")
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
        print(f"Error al guardar foto: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500

@app.route('/escuelas', methods=['GET', 'POST'])
def escuelas():
    if not session.get('logged_in'): return redirect(url_for('index'))
    
    email = session.get('user')
    if email in active_sessions and active_sessions[email]['session_id'] != session.get('session_id'):
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
                    convert(docx_path, pdf_path)
                    
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
    if email in active_sessions and active_sessions[email]['session_id'] != session.get('session_id'):
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
    if email in active_sessions and active_sessions[email]['session_id'] != session.get('session_id'):
        session.clear(); return redirect(url_for('index'))
    
    curso = session.get('curso')
    materia = request.args.get('materia')

    if not curso or not materia: return redirect(url_for('launcher'))
    if not session.get('devices_verified'):
        return redirect(url_for('test', next=url_for('examen', materia=materia)))

    try:
        df_c = pd.read_csv(COURSES_CSV, encoding='utf-8', engine='python')
        row = df_c[(df_c['curso'] == curso) & (df_c['materia'] == materia)].iloc[0]

        fecha_str = str(row['fecha_disponible']).strip()
        final_str = str(row['horario_final']).strip()
        
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
            'date': str(row['fecha_disponible']),
            'start_time': row['horario_inicio'],
            'end_time': row['horario_final'],
            'total_seconds': int(remaining_seconds) 
        }

        df_p = pd.read_csv(QUESTIONS_CSV, encoding='utf-8', engine='python')
        q_df = df_p[(df_p['Curso'] == curso) & (df_p['Materia'] == materia)].sort_values(by='Pregunta_número')
        questions = q_df.to_dict('records')
        return render_template('examen.html', fullname=session.get('fullname'), questions=questions, exam_details=details)
    except Exception as e:
        print(f"Error cargando examen: {e}")
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
        print(f"Error al guardar resultados del examen: {e}")
        return jsonify({'success': False, 'message': 'Error del servidor'}), 500
    
@app.route('/resultados')
def resultados():
    if not session.get('logged_in'): return redirect(url_for('index'))
    materia = request.args.get('materia')
    if not materia: return redirect(url_for('launcher'))
    
    return render_template('resultados.html', 
                         fullname=session.get('fullname'), 
                         curso=session.get('curso'),
                         materia=materia)

@app.route('/api/get-exam-results')
def get_exam_results_api():
    if not session.get('logged_in'):
        return jsonify({'success': False, 'message': 'No autorizado'}), 401
    
    folio_usuario = str(session.get('folio'))
    curso_usuario = session.get('curso')
    materia_solicitada = request.args.get('materia')
    
    if not materia_solicitada:
        return jsonify({'success': False, 'message': 'Falta especificar la materia'}), 400

    try:
        if not os.path.exists(RESULTADOS_CSV):
            return jsonify({'success': False, 'message': 'Aún no hay resultados registrados en el sistema.'}), 404

        df = pd.read_csv(RESULTADOS_CSV, encoding='utf-8', dtype={'folio': str})
        
        df['folio'] = df['folio'].astype(str).str.strip()
        df['curso'] = df['curso'].astype(str).str.strip()
        df['materia'] = df['materia'].astype(str).str.strip()
        
        mask = (
            (df['folio'] == folio_usuario) & 
            (df['curso'] == curso_usuario) & 
            (df['materia'] == materia_solicitada)
        )
        df_res = df[mask].copy()
        
        if df_res.empty:
            return jsonify({'success': False, 'message': 'No se encontraron resultados para este examen y usuario.'}), 404
        
        details = []
        correctas = 0
        incorrectas = 0
        sin_responder = 0
        
        for _, row in df_res.iterrows():
            pregunta_num = row.get('Pregunta_número')
            pregunta_txt = row.get('Pregunta', 'Pregunta sin texto')
            
            seleccion_raw = str(row.get('Respuesta_seleccionada', '')).strip()
            
            correcta_raw = str(row.get('Respuesta_correcta', '')).strip()
            
            def normalizar_opcion(texto):
                texto = texto.lower()
                if 'respuesta_a' in texto or texto == 'a': return 'A'
                if 'respuesta_b' in texto or texto == 'b': return 'B'
                if 'respuesta_c' in texto or texto == 'c': return 'C'
                if 'respuesta_d' in texto or texto == 'd': return 'D'
                return ''

            sel_letra = normalizar_opcion(seleccion_raw)
            corr_letra = normalizar_opcion(correcta_raw)
            
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
                    'A': row.get('Respuesta_a', ''),
                    'B': row.get('Respuesta_b', ''),
                    'C': row.get('Respuesta_c', ''),
                    'D': row.get('Respuesta_d', '')
                },
                'seleccionada': sel_letra,
                'correcta': corr_letra,
                'status': status
            })
            
        try:
            details.sort(key=lambda x: int(x['numero']))
        except:
            pass

        total_preguntas = len(details)
        calificacion = (correctas / total_preguntas * 10) if total_preguntas > 0 else 0

        summary = {
            'total': total_preguntas,
            'correctas': correctas,
            'incorrectas': incorrectas,
            'sin_responder': sin_responder,
            'calificacion': round(calificacion, 1)
        }

        return jsonify({'success': True, 'summary': summary, 'details': details})

    except Exception as e:
        print(f"Error procesando resultados: {e}")
        return jsonify({'success': False, 'message': f'Error interno: {str(e)}'}), 500

@app.route('/logout')
def logout():
    remove_active_session(session.get('user'))
    session.clear()
    return redirect(url_for('index'))

# --- CONFIGURACIÓN DE GUNICORN INTEGRADA ---
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
    import sys
    import os
    
    # 1. Generamos los certificados
    ssl_config = generate_self_signed_cert()
    ctx = (ssl_config[0], ssl_config[1]) if ssl_config != 'adhoc' else 'adhoc'
    
    # ==========================================
    # MODO DESARROLLO (Para programar)
    # Ejecutar con: python3 app.py --dev
    # ==========================================
    if '--dev' in sys.argv:
        print("--- MODO DEVELOPER (FLASK) ---")
        print("Recarga en tiempo real ACTIVADA. Solo para programar.")
        app.run(host='0.0.0.0', port=8000, debug=True, ssl_context=ctx)
        
    # ==========================================
    # MODO EXAMEN (Para los usuarios)
    # Ejecutar con: python3 app.py
    # ==========================================
    else:
        print("--- MODO DEPLOY (GUNICORN) ---")
        print("Workers ACTIVADOS. Recarga desactivada para máximo rendimiento.")
        cmd = [
            sys.executable, '-m', 'gunicorn',
            '-w', '20',                
            '-b', '0.0.0.0:8000',     
            '--timeout', '120',       
            'app:app'                 
        ]
        
        if ssl_config != 'adhoc':
            cmd.extend(['--certfile', ssl_config[0]])
            cmd.extend(['--keyfile', ssl_config[1]])
            
        os.execv(sys.executable, cmd)