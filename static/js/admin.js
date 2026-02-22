// Archivo: admin.js (Funcionalidades para el Panel de Administración)

document.addEventListener('DOMContentLoaded', () => {
    // === 1. ELEMENTOS DEL DOM ===
    
    // Usuarios
    const searchInput = document.getElementById('searchInput');
    const searchBtn = document.getElementById('searchBtn');
    const usersTable = document.getElementById('usersTable').getElementsByTagName('tbody')[0];
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    const pageInfo = document.getElementById('pageInfo');
    
    // Botones Globales (Usuarios y Docs)
    const importUsersBtn = document.getElementById('importUsersBtn');
    const exportUsersBtn = document.getElementById('exportUsersBtn');
    const importDocsBtn = document.getElementById('importDocsBtn');
    const exportDocsBtn = document.getElementById('exportDocsBtn');
    
    // Elementos Generales
    const csvFileInput = document.getElementById('csvFileInput');
    const userModal = document.getElementById('userModal');
    const closeModalBtns = document.querySelectorAll('.close-modal, .modal-close-btn');
    const userForm = document.getElementById('userForm');
    
    // Cámara
    const openCameraBtn = document.getElementById('openCameraBtn');
    const cameraInterface = document.getElementById('cameraInterface');
    const modalBody = document.getElementById('modalBody');
    const closeCameraBtn = document.querySelector('.close-camera-btn');
    const takePhotoBtn = document.getElementById('takePhotoBtn');
    const cameraVideo = document.getElementById('cameraVideo');
    const cameraCanvas = document.getElementById('cameraCanvas');
    let cameraStream = null;

    // Modal de Previsualización (Archivos CSV)
    const previewModal = document.getElementById('previewModal');
    const previewTitle = document.getElementById('previewTitle');
    const previewBody = document.getElementById('previewBody');
    const previewCloseBtns = document.querySelectorAll('.preview-close-btn');

    // Variables de Estado
    let currentPage = 1;
    const rowsPerPage = 10;
    let filteredData = Array.from(usersTable.rows);
    let allUsers = Array.from(usersTable.rows);
    let currentCourses = [];

    // Notificación de copia
    const copyNotification = document.createElement('div');
    copyNotification.className = 'copy-notification';
    copyNotification.innerHTML = '<i class="fas fa-check"></i> Copiado al portapapeles';
    document.body.appendChild(copyNotification);

    // === 2. INICIALIZACIÓN ===
    initTable();
    loadCourses();

    async function loadCourses() {
        try {
            const response = await fetch('/api/admin/courses');
            const data = await response.json();
            if (data.success) {
                currentCourses = data.courses;
            }
        } catch (error) {
            console.error('Error al cargar cursos:', error);
        }
    }

    // === 3. LÓGICA DE TABLA DE USUARIOS ===
    function initTable() {
        allUsers = Array.from(usersTable.rows);
        filteredData = [...allUsers];
        currentPage = 1;
        renderTable();
    }

    function filterTable() {
        const searchTerm = searchInput.value.toLowerCase().trim();
        if (!searchTerm) {
            filteredData = [...allUsers];
        } else {
            filteredData = allUsers.filter(row => {
                const cells = Array.from(row.cells);
                const rowText = cells.slice(0, 4).map(cell => cell.textContent.toLowerCase()).join(' ');
                return rowText.includes(searchTerm);
            });
        }
        currentPage = 1;
        renderTable();
    }

    function renderTable() {
        usersTable.innerHTML = '';
        const startIndex = (currentPage - 1) * rowsPerPage;
        const endIndex = startIndex + rowsPerPage;
        const pageData = filteredData.slice(startIndex, endIndex);

        pageData.forEach(row => {
            usersTable.appendChild(row.cloneNode(true));
        });

        updatePaginationButtons();
        attachRowEvents();
    }

    function updatePaginationButtons() {
        const totalPages = Math.ceil(filteredData.length / rowsPerPage) || 1;
        pageInfo.textContent = `Página ${currentPage} de ${totalPages}`;
        prevBtn.disabled = currentPage === 1;
        nextBtn.disabled = currentPage === totalPages || totalPages === 0;
    }

    function attachRowEvents() {
        document.querySelectorAll('.view-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const userId = e.currentTarget.dataset.userId;
                showUserDetails(userId);
            });
        });

        document.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const userId = e.currentTarget.dataset.userId;
                deleteUser(userId);
            });
        });
    }

    // === 4. PORTAPAPELES Y FORMULARIOS ===
    function showCopyNotification(text) {
        copyNotification.textContent = `Copiado: ${text.substring(0, 30)}${text.length > 30 ? '...' : ''}`;
        copyNotification.style.display = 'block';
        setTimeout(() => { copyNotification.style.display = 'none'; }, 2000);
    }

    function copyToClipboard(text) {
        navigator.clipboard.writeText(text).then(() => {
            showCopyNotification(text);
        }).catch(err => {
            console.error('Error al copiar: ', err);
            alert('Error al copiar al portapapeles');
        });
    }

    function createInputWithCopy(id, name, value, type = 'text', required = false, readonly = false, isSelect = false, options = null) {
        let inputHtml = '';
        if (isSelect && options) {
            inputHtml = `<select id="${id}" name="${name}" ${required ? 'required' : ''} ${readonly ? 'disabled' : ''} class="form-control">${options}</select>`;
        } else {
            inputHtml = `<input type="${type}" id="${id}" name="${name}" value="${value || ''}" ${required ? 'required' : ''} ${readonly ? 'readonly' : ''} class="form-control">`;
        }
        return `
            <div class="input-with-copy">
                ${inputHtml}
                <button type="button" class="copy-btn" data-field-id="${id}"><i class="fas fa-copy"></i></button>
            </div>
        `;
    }

    // === 5. MODAL DE USUARIO Y VALIDACIÓN ===
    async function showUserDetails(userId) {
        try {
            modalBody.innerHTML = '<div style="text-align: center; padding: 40px;"><i class="fas fa-spinner fa-spin fa-2x"></i><p>Cargando datos...</p></div>';
            userModal.style.display = 'flex';
            cameraInterface.style.display = 'none';
            modalBody.style.display = 'block';

            const response = await fetch(`/api/user/${userId}`);
            const data = await response.json();
            
            if (!data.success) {
                alert(data.message || 'Error al cargar los detalles del usuario');
                userModal.style.display = 'none';
                return;
            }
            
            const user = data.user;
            let courseOptions = '<option value="">Seleccionar curso</option>';
            if (currentCourses.length > 0) {
                currentCourses.forEach(course => {
                    const selected = course === user.curso ? 'selected' : '';
                    courseOptions += `<option value="${course}" ${selected}>${course}</option>`;
                });
            } else {
                courseOptions += `<option value="${user.curso || ''}" selected>${user.curso || ''}</option>`;
            }
            
            let numOptionsHtml = '';
            for (let i = 0; i <= 10; i++) {
                const selected = user.num_opciones_preferidas == i ? 'selected' : '';
                numOptionsHtml += `<option value="${i}" ${selected}>${i}</option>`;
            }
            
            let html = `
                <div class="form-container">
                    <div class="form-section">
                        <h4>Información Básica</h4>
                        <div class="form-group"><label>Folio:</label>${createInputWithCopy('folio', 'folio', user.folio || '', 'text', false, true)}</div>
                        <div class="form-group"><label>Curso:</label>${createInputWithCopy('curso', 'curso', user.curso || '', 'text', true, false, true, courseOptions)}<div class="error-message">Seleccione un curso</div></div>
                        <div class="form-group"><label>Usuario:</label>${createInputWithCopy('username', 'username', user.username || '', 'text', true, true)}<div class="error-message">El usuario es requerido</div></div>
                        <div class="form-group"><label>Contraseña:</label>${createInputWithCopy('password', 'password', user.password || '', 'text', true, true)}<div class="error-message">La contraseña es requerida</div></div>
                    </div>
                    <div class="form-section">
                        <h4>Datos Personales</h4>
                        <div class="form-group"><label>Nombre:</label>${createInputWithCopy('nombre', 'nombre', user.nombre || '', 'text', true)}<div class="error-message">El nombre es requerido</div></div>
                        <div class="form-group"><label>Apellido Paterno:</label>${createInputWithCopy('apellido_paterno', 'apellido_paterno', user.apellido_paterno || '', 'text', true)}<div class="error-message">El apellido paterno es requerido</div></div>
                        <div class="form-group"><label>Apellido Materno:</label>${createInputWithCopy('apellido_materno', 'apellido_materno', user.apellido_materno || '', 'text', true)}<div class="error-message">El apellido materno es requerido</div></div>
                        <div class="form-group"><label>Email:</label>${createInputWithCopy('email', 'email', user.email || '', 'email', true)}<div class="error-message">Ingrese un email válido</div></div>
                        <div class="form-group"><label>Fecha de Nacimiento:</label>${createInputWithCopy('fecha_nacimiento', 'fecha_nacimiento', user.fecha_nacimiento || '', 'date', true)}<div class="error-message">Seleccione una fecha válida</div></div>
                    </div>
                    <div class="form-section">
                        <h4>Opciones de Escuelas</h4>
                        <div class="form-group"><label>Número de Opciones Preferidas:</label>${createInputWithCopy('num_opciones_preferidas', 'num_opciones_preferidas', user.num_opciones_preferidas || '0', 'text', false, false, true, numOptionsHtml)}</div>
                        <div class="opciones-container">
            `;
            
            for (let i = 1; i <= 10; i++) {
                html += `<div class="opcion-item"><div class="form-group"><label>Opción ${i}:</label>${createInputWithCopy(`opcion${i}`, `opcion${i}`, user[`opcion${i}`] || '', 'text', false, false)}</div></div>`;
            }
            
            html += `</div></div></div>`;
            modalBody.innerHTML = html;
            
            modalBody.querySelectorAll('.copy-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const fieldId = e.currentTarget.dataset.fieldId;
                    const fieldElement = document.getElementById(fieldId);
                    let textToCopy = fieldElement.tagName === 'SELECT' ? fieldElement.options[fieldElement.selectedIndex].text : fieldElement.value;
                    copyToClipboard(textToCopy);
                });
            });
            
            setupFormValidation();
            userForm.dataset.currentFolio = user.folio;
            
        } catch (error) {
            console.error('Error al cargar detalles:', error);
            alert('Error al cargar los detalles del usuario');
            userModal.style.display = 'none';
        }
    }

    function setupFormValidation() {
        const form = document.getElementById('userForm');
        form.querySelectorAll('input[required], select[required]').forEach(input => {
            const formGroup = input.closest('.form-group');
            input.addEventListener('blur', () => validateInput(input, formGroup));
            input.addEventListener('input', () => validateInput(input, formGroup));
        });
    }

    function validateInput(input, formGroup) {
        let isValid = true;
        let errorMessage = '';
        
        if (input.hasAttribute('required') && !input.value.trim()) {
            isValid = false;
            errorMessage = 'Este campo es requerido';
        } else if (input.type === 'email' && input.value) {
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.value)) { isValid = false; errorMessage = 'Ingrese un email válido'; }
        } else if (input.type === 'date' && input.value) {
            if (new Date(input.value) > new Date()) { isValid = false; errorMessage = 'La fecha no puede ser futura'; }
        }
        
        if (isValid) {
            formGroup.classList.remove('error');
            formGroup.querySelector('.error-message').style.display = 'none';
        } else {
            formGroup.classList.add('error');
            const errorElement = formGroup.querySelector('.error-message');
            errorElement.textContent = errorMessage;
            errorElement.style.display = 'block';
        }
        return isValid;
    }

    function validateForm() {
        let isValid = true;
        document.getElementById('userForm').querySelectorAll('input[required], select[required]').forEach(input => {
            if (!validateInput(input, input.closest('.form-group'))) isValid = false;
        });
        return isValid;
    }

    function deleteUser(userId) {
        if (confirm(`¿Estás seguro de que quieres ELIMINAR al usuario con folio: ${userId}?\n\nEsta acción no se puede deshacer.`)) {
            alert(`Usuario ${userId} marcado para eliminación.\n\nEn un entorno real, se eliminaría del sistema después de confirmación.`);
        }
    }

    // === 6. IMPORTACIÓN / EXPORTACIÓN GLOBAL (Usuarios y Docs) ===
    function exportUsers() { window.location.href = '/api/admin/export-users'; }
    function importUsers() { csvFileInput.setAttribute('data-type', 'users'); csvFileInput.click(); }
    
    function importDocs() { csvFileInput.setAttribute('data-type', 'docs'); csvFileInput.click(); }
    function exportDocs() { alert('Función de exportar documentos CSV (registros, comprobantes).\n\nDisponible en la próxima versión.'); }

    // === 7. LÓGICA DE LA TABLA DE ARCHIVOS CSV (Previsualizar, Exportar, Importar) ===
    
    // Exportar Archivo Específico
    document.querySelectorAll('.action-export-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const filename = e.currentTarget.dataset.filename;
            window.location.href = `/api/admin/export-file/${filename}`;
        });
    });

    // Importar Archivo Específico (Reemplazar)
    document.querySelectorAll('.action-import-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const filename = e.currentTarget.dataset.filename;
            csvFileInput.setAttribute('data-type', 'files');
            csvFileInput.setAttribute('data-filename', filename);
            csvFileInput.click(); 
        });
    });

    // Previsualizar Archivo Específico (Completo y con Sticky Header)
    if (previewModal) {
        document.querySelectorAll('.action-preview-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const filename = e.currentTarget.dataset.filename;
                
                previewTitle.textContent = `Previsualizando: ${filename}`;
                previewBody.innerHTML = '<div style="text-align: center; padding: 40px;"><i class="fas fa-spinner fa-spin fa-2x"></i><p>Cargando datos completos...</p></div>';
                previewModal.style.display = 'flex';

                try {
                    const response = await fetch(`/api/admin/preview-file/${filename}`);
                    const data = await response.json();
                    
                    if (data.success) {
                        previewBody.innerHTML = data.html;
                        
                        // Estilos avanzados para la tabla completa
                        const table = previewBody.querySelector('table');
                        if (table) {
                            table.style.width = '100%';
                            table.style.borderCollapse = 'collapse';
                            
                            table.querySelectorAll('th, td').forEach(cell => {
                                cell.style.border = '1px solid #ddd';
                                cell.style.padding = '10px 15px'; 
                                cell.style.textAlign = 'left';
                                cell.style.whiteSpace = 'nowrap';
                            });
                            
                            table.querySelectorAll('th').forEach(th => {
                                th.style.backgroundColor = '#2c3e50';
                                th.style.color = 'white';
                                // Encabezado fijo (Sticky)
                                th.style.position = 'sticky';
                                th.style.top = '0';
                                th.style.zIndex = '1';
                                th.style.boxShadow = '0 2px 5px rgba(0,0,0,0.1)';
                            });
                        }
                    } else {
                        previewBody.innerHTML = `<p style="color: #e74c3c; text-align: center;">${data.message}</p>`;
                    }
                } catch (error) {
                    console.error("Error preview:", error);
                    previewBody.innerHTML = `<p style="color: #e74c3c; text-align: center;">Error al cargar la previsualización.</p>`;
                }
            });
        });

        // Cerrar modal de previsualización
        previewCloseBtns.forEach(btn => {
            btn.addEventListener('click', () => { previewModal.style.display = 'none'; });
        });

        window.addEventListener('click', (event) => {
            if (event.target === previewModal) previewModal.style.display = 'none';
        });
    }

    // === 8. MANEJO DEL INPUT DE ARCHIVOS (SUBIDA AL SERVIDOR) ===
    async function handleFileImport(file, type) {
        const formData = new FormData();
        formData.append('file', file);
        
        let endpoint = '';
        switch(type) {
            case 'users': 
                endpoint = '/api/admin/import-users'; 
                break;
            case 'files': 
                const filename = csvFileInput.getAttribute('data-filename');
                endpoint = `/api/admin/import-file/${filename}`; 
                break;
            case 'docs': 
                endpoint = '/api/admin/import-docs'; 
                break;
            default: 
                alert('Tipo de archivo no válido'); 
                return;
        }
        
        try {
            const response = await fetch(endpoint, {
                method: 'POST',
                body: formData
            });
            const data = await response.json();
            
            if (data.success) {
                alert(data.message);
                if (type === 'users' || type === 'files') window.location.reload();
            } else {
                alert(`Error: ${data.message}`);
            }
        } catch (error) {
            console.error('Error al importar:', error);
            alert('Error al importar el archivo. Verifica la consola.');
        }
    }

    csvFileInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        const type = csvFileInput.getAttribute('data-type');
        if (file) handleFileImport(file, type);
        csvFileInput.value = ''; // Limpiar el input para permitir subir el mismo archivo
    });

    async function handleFormSubmit(event) {
        event.preventDefault();
        if (!validateForm()) { alert('Por favor, complete todos los campos requeridos correctamente.'); return; }
        
        const folio = userForm.dataset.currentFolio;
        const formData = new FormData(userForm);
        const data = {};
        formData.forEach((value, key) => { data[key] = value; });
        
        try {
            const response = await fetch(`/api/admin/update-user/${folio}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            const result = await response.json();
            
            if (result.success) {
                alert('Usuario actualizado correctamente');
                userModal.style.display = 'none';
                window.location.reload();
            } else {
                alert(`Error: ${result.message}`);
            }
        } catch (error) {
            console.error('Error al actualizar usuario:', error);
            alert('Error al actualizar el usuario');
        }
    }

    // === 9. FUNCIONES DE CÁMARA ===
    async function startCamera() {
        try {
            modalBody.style.display = 'none';
            cameraInterface.style.display = 'flex';
            
            const constraints = { video: { facingMode: 'environment', width: { ideal: 1080 }, height: { ideal: 1080 } } };
            cameraStream = await navigator.mediaDevices.getUserMedia(constraints);
            cameraVideo.srcObject = cameraStream;
        } catch (error) {
            console.error('Error al acceder a la cámara:', error);
            alert('No se pudo acceder a la cámara. Verifique los permisos.');
            closeCamera();
        }
    }

    function closeCamera() {
        if (cameraStream) { cameraStream.getTracks().forEach(track => track.stop()); cameraStream = null; }
        cameraInterface.style.display = 'none';
        modalBody.style.display = 'block';
    }

    function takePhoto() {
        if (!cameraVideo.srcObject) return;
        const size = Math.min(cameraVideo.videoWidth, cameraVideo.videoHeight);
        const startX = (cameraVideo.videoWidth - size) / 2;
        const startY = (cameraVideo.videoHeight - size) / 2;
        
        cameraCanvas.width = size;
        cameraCanvas.height = size;
        const ctx = cameraCanvas.getContext('2d');
        ctx.drawImage(cameraVideo, startX, startY, size, size, 0, 0, size, size);
        
        uploadPhoto(cameraCanvas.toDataURL('image/png'));
    }

    async function uploadPhoto(base64Image) {
        const folio = document.getElementById('folio').value;
        const cursoSelect = document.getElementById('curso');
        const curso = cursoSelect.options[cursoSelect.selectedIndex].text;

        if (!folio || !curso) { alert('Error: No se pudo identificar el folio o el curso.'); return; }

        try {
            const response = await fetch('/api/admin/save-photo', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ folio: folio, curso: curso, image: base64Image })
            });
            const result = await response.json();

            if (result.success) { alert('Fotografía guardada exitosamente.'); closeCamera(); }
            else { alert('Error al guardar: ' + result.message); }
        } catch (error) {
            console.error('Error subiendo foto:', error);
            alert('Error de conexión al guardar la foto.');
        }
    }

    // === 10. EVENT LISTENERS FINALES ===
    searchBtn.addEventListener('click', filterTable);
    searchInput.addEventListener('keyup', (e) => { if (e.key === 'Enter') filterTable(); });

    prevBtn.addEventListener('click', () => { if (currentPage > 1) { currentPage--; renderTable(); } });
    nextBtn.addEventListener('click', () => { if (currentPage < Math.ceil(filteredData.length / rowsPerPage)) { currentPage++; renderTable(); } });

    if(importUsersBtn) importUsersBtn.addEventListener('click', importUsers);
    if(exportUsersBtn) exportUsersBtn.addEventListener('click', exportUsers);
    if(importDocsBtn) importDocsBtn.addEventListener('click', importDocs);
    if(exportDocsBtn) exportDocsBtn.addEventListener('click', exportDocs);

    closeModalBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            userModal.style.display = 'none';
            closeCamera();
        });
    });

    window.addEventListener('click', (event) => {
        if (event.target === userModal) {
            userModal.style.display = 'none';
            closeCamera();
        }
    });

    openCameraBtn.addEventListener('click', startCamera);
    closeCameraBtn.addEventListener('click', closeCamera);
    takePhotoBtn.addEventListener('click', takePhoto);
    userForm.addEventListener('submit', handleFormSubmit);
    
    attachRowEvents();
});