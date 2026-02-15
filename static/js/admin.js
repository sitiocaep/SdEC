// Archivo: admin.js (Funcionalidades para el Panel de Administración)

document.addEventListener('DOMContentLoaded', () => {
    // Elementos del DOM
    const searchInput = document.getElementById('searchInput');
    const searchBtn = document.getElementById('searchBtn');
    const usersTable = document.getElementById('usersTable').getElementsByTagName('tbody')[0];
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    const pageInfo = document.getElementById('pageInfo');
    const importUsersBtn = document.getElementById('importUsersBtn');
    const exportUsersBtn = document.getElementById('exportUsersBtn');
    const importFilesBtn = document.getElementById('importFilesBtn');
    const exportFilesBtn = document.getElementById('exportFilesBtn');
    const importDocsBtn = document.getElementById('importDocsBtn');
    const exportDocsBtn = document.getElementById('exportDocsBtn');
    const csvFileInput = document.getElementById('csvFileInput');
    const userModal = document.getElementById('userModal');
    const closeModalBtns = document.querySelectorAll('.close-modal, .modal-close-btn');
    const userForm = document.getElementById('userForm');
    
    // Elementos de la Cámara
    const openCameraBtn = document.getElementById('openCameraBtn');
    const cameraInterface = document.getElementById('cameraInterface');
    const modalBody = document.getElementById('modalBody');
    const closeCameraBtn = document.querySelector('.close-camera-btn');
    const takePhotoBtn = document.getElementById('takePhotoBtn');
    const cameraVideo = document.getElementById('cameraVideo');
    const cameraCanvas = document.getElementById('cameraCanvas');
    let cameraStream = null;

    // Variables para la paginación
    let currentPage = 1;
    const rowsPerPage = 10;
    let filteredData = Array.from(usersTable.rows);
    let allUsers = Array.from(usersTable.rows);
    let currentCourses = [];

    // Crear notificación de copia
    const copyNotification = document.createElement('div');
    copyNotification.className = 'copy-notification';
    copyNotification.innerHTML = '<i class="fas fa-check"></i> Copiado al portapapeles';
    document.body.appendChild(copyNotification);

    // Inicializar
    initTable();
    loadCourses();

    // Función para cargar la lista de cursos
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

    // Función para inicializar la tabla
    function initTable() {
        allUsers = Array.from(usersTable.rows);
        filteredData = [...allUsers];
        currentPage = 1;
        renderTable();
    }

    // Función para filtrar la tabla
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

    // Función para renderizar la tabla con paginación
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

    // Función para actualizar los botones de paginación
    function updatePaginationButtons() {
        const totalPages = Math.ceil(filteredData.length / rowsPerPage) || 1;
        pageInfo.textContent = `Página ${currentPage} de ${totalPages}`;
        prevBtn.disabled = currentPage === 1;
        nextBtn.disabled = currentPage === totalPages || totalPages === 0;
    }

    // Función para asignar eventos a las filas
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

    // Función para mostrar notificación de copia
    function showCopyNotification(text) {
        copyNotification.textContent = `Copiado: ${text.substring(0, 30)}${text.length > 30 ? '...' : ''}`;
        copyNotification.style.display = 'block';
        setTimeout(() => {
            copyNotification.style.display = 'none';
        }, 2000);
    }

    // Función para copiar al portapapeles
    function copyToClipboard(text) {
        navigator.clipboard.writeText(text).then(() => {
            showCopyNotification(text);
        }).catch(err => {
            console.error('Error al copiar: ', err);
            alert('Error al copiar al portapapeles');
        });
    }

    // Función para crear campo con botón de copia
    function createInputWithCopy(id, name, value, type = 'text', required = false, readonly = false, isSelect = false, options = null) {
        let inputHtml = '';
        
        if (isSelect && options) {
            inputHtml = `
                <select id="${id}" name="${name}" ${required ? 'required' : ''} ${readonly ? 'disabled' : ''} class="form-control">
                    ${options}
                </select>
            `;
        } else {
            inputHtml = `
                <input type="${type}" id="${id}" name="${name}" value="${value || ''}" 
                       ${required ? 'required' : ''} ${readonly ? 'readonly' : ''} class="form-control">
            `;
        }
        
        return `
            <div class="input-with-copy">
                ${inputHtml}
                <button type="button" class="copy-btn" data-field-id="${id}">
                    <i class="fas fa-copy"></i>
                </button>
            </div>
        `;
    }

    // Función para mostrar/editar detalles del usuario
    async function showUserDetails(userId) {
        try {
            const modalBody = document.getElementById('modalBody');
            modalBody.innerHTML = '<div style="text-align: center; padding: 40px;"><i class="fas fa-spinner fa-spin fa-2x"></i><p>Cargando datos...</p></div>';
            userModal.style.display = 'flex';
            
            // Asegurarse de que la interfaz de cámara esté oculta al abrir
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
                        
                        <div class="form-group">
                            <label for="folio">Folio:</label>
                            ${createInputWithCopy('folio', 'folio', user.folio || '', 'text', false, true)}
                        </div>
                        
                        <div class="form-group">
                            <label for="curso">Curso:</label>
                            ${createInputWithCopy('curso', 'curso', user.curso || '', 'text', true, false, true, courseOptions)}
                            <div class="error-message">Seleccione un curso</div>
                        </div>
                        
                        <div class="form-group">
                            <label for="username">Usuario:</label>
                            ${createInputWithCopy('username', 'username', user.username || '', 'text', true, true)}
                            <div class="error-message">El usuario es requerido</div>
                        </div>
                        
                        <div class="form-group">
                            <label for="password">Contraseña:</label>
                            ${createInputWithCopy('password', 'password', user.password || '', 'text', true, true)}
                            <div class="error-message">La contraseña es requerida</div>
                        </div>
                    </div>
                    
                    <div class="form-section">
                        <h4>Datos Personales</h4>
                        
                        <div class="form-group">
                            <label for="nombre">Nombre:</label>
                            ${createInputWithCopy('nombre', 'nombre', user.nombre || '', 'text', true)}
                            <div class="error-message">El nombre es requerido</div>
                        </div>
                        
                        <div class="form-group">
                            <label for="apellido_paterno">Apellido Paterno:</label>
                            ${createInputWithCopy('apellido_paterno', 'apellido_paterno', user.apellido_paterno || '', 'text', true)}
                            <div class="error-message">El apellido paterno es requerido</div>
                        </div>
                        
                        <div class="form-group">
                            <label for="apellido_materno">Apellido Materno:</label>
                            ${createInputWithCopy('apellido_materno', 'apellido_materno', user.apellido_materno || '', 'text', true)}
                            <div class="error-message">El apellido materno es requerido</div>
                        </div>
                        
                        <div class="form-group">
                            <label for="email">Email:</label>
                            ${createInputWithCopy('email', 'email', user.email || '', 'email', true)}
                            <div class="error-message">Ingrese un email válido</div>
                        </div>
                        
                        <div class="form-group">
                            <label for="fecha_nacimiento">Fecha de Nacimiento:</label>
                            ${createInputWithCopy('fecha_nacimiento', 'fecha_nacimiento', user.fecha_nacimiento || '', 'date', true)}
                            <div class="error-message">Seleccione una fecha válida</div>
                        </div>
                    </div>
                    
                    <div class="form-section">
                        <h4>Opciones de Escuelas</h4>
                        
                        <div class="form-group">
                            <label for="num_opciones_preferidas">Número de Opciones Preferidas:</label>
                            ${createInputWithCopy('num_opciones_preferidas', 'num_opciones_preferidas', user.num_opciones_preferidas || '0', 'text', false, false, true, numOptionsHtml)}
                        </div>
                        
                        <div class="opciones-container">
            `;
            
            for (let i = 1; i <= 10; i++) {
                const opcionValue = user[`opcion${i}`] || '';
                html += `
                    <div class="opcion-item">
                        <div class="form-group">
                            <label for="opcion${i}">Opción ${i}:</label>
                            ${createInputWithCopy(`opcion${i}`, `opcion${i}`, opcionValue, 'text', false, false)}
                        </div>
                    </div>
                `;
            }
            
            html += `
                        </div>
                    </div>
                </div>
            `;
            
            modalBody.innerHTML = html;
            
            modalBody.querySelectorAll('.copy-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const fieldId = e.currentTarget.dataset.fieldId;
                    const fieldElement = document.getElementById(fieldId);
                    
                    let textToCopy = '';
                    if (fieldElement.tagName === 'SELECT') {
                        textToCopy = fieldElement.options[fieldElement.selectedIndex].text;
                    } else {
                        textToCopy = fieldElement.value;
                    }
                    
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

    // Función para configurar validación del formulario
    function setupFormValidation() {
        const form = document.getElementById('userForm');
        const inputs = form.querySelectorAll('input[required], select[required]');
        
        inputs.forEach(input => {
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
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(input.value)) {
                isValid = false;
                errorMessage = 'Ingrese un email válido';
            }
        } else if (input.type === 'date' && input.value) {
            const selectedDate = new Date(input.value);
            const today = new Date();
            if (selectedDate > today) {
                isValid = false;
                errorMessage = 'La fecha no puede ser futura';
            }
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
        const form = document.getElementById('userForm');
        const inputs = form.querySelectorAll('input[required], select[required]');
        let isValid = true;
        
        inputs.forEach(input => {
            const formGroup = input.closest('.form-group');
            if (!validateInput(input, formGroup)) {
                isValid = false;
            }
        });
        
        return isValid;
    }

    function deleteUser(userId) {
        if (confirm(`¿Estás seguro de que quieres ELIMINAR al usuario con folio: ${userId}?\n\nEsta acción no se puede deshacer.`)) {
            alert(`Usuario ${userId} marcado para eliminación.\n\nEn un entorno real, se eliminaría del sistema después de confirmación.`);
        }
    }

    function exportUsers() {
        window.location.href = '/api/admin/export-users';
    }

    function importUsers() {
        csvFileInput.setAttribute('data-type', 'users');
        csvFileInput.click();
    }

    function importFiles() {
        csvFileInput.setAttribute('data-type', 'files');
        csvFileInput.click();
    }

    function exportFiles() {
        alert('Función de exportar archivos CSV (cursos, preguntas, puntajes).\n\nEsta funcionalidad estará disponible en la próxima versión.');
    }

    function importDocs() {
        csvFileInput.setAttribute('data-type', 'docs');
        csvFileInput.click();
    }

    function exportDocs() {
        alert('Función de exportar documentos CSV (registros, comprobantes).\n\nEsta funcionalidad estará disponible en la próxima versión.');
    }

    async function handleFileImport(file, type) {
        const formData = new FormData();
        formData.append('file', file);
        
        let endpoint = '';
        switch(type) {
            case 'users': endpoint = '/api/admin/import-users'; break;
            case 'files': endpoint = '/api/admin/import-files'; break;
            case 'docs': endpoint = '/api/admin/import-docs'; break;
            default: alert('Tipo de archivo no válido'); return;
        }
        
        try {
            const response = await fetch(endpoint, {
                method: 'POST',
                body: formData
            });
            const data = await response.json();
            
            if (data.success) {
                alert(data.message);
                if (type === 'users') window.location.reload();
            } else {
                alert(`Error: ${data.message}`);
            }
        } catch (error) {
            console.error('Error al importar:', error);
            alert('Error al importar el archivo');
        }
    }

    async function handleFormSubmit(event) {
        event.preventDefault();
        
        if (!validateForm()) {
            alert('Por favor, complete todos los campos requeridos correctamente.');
            return;
        }
        
        const folio = userForm.dataset.currentFolio;
        const formData = new FormData(userForm);
        const data = {};
        
        formData.forEach((value, key) => { data[key] = value; });
        
        try {
            const response = await fetch(`/api/admin/update-user/${folio}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', },
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

    // === FUNCIONES DE CÁMARA ===

    async function startCamera() {
        try {
            // Ocultar formulario, mostrar cámara
            modalBody.style.display = 'none';
            cameraInterface.style.display = 'flex';
            
            // Solicitar acceso a cámara
            // Preferencia por cámara cuadrada si el dispositivo lo soporta, aunque raremente lo hacen directamente
            const constraints = {
                video: {
                    facingMode: 'environment', // Cámara trasera preferiblemente
                    width: { ideal: 1080 },
                    height: { ideal: 1080 }
                }
            };
            
            cameraStream = await navigator.mediaDevices.getUserMedia(constraints);
            cameraVideo.srcObject = cameraStream;
            
        } catch (error) {
            console.error('Error al acceder a la cámara:', error);
            alert('No se pudo acceder a la cámara. Verifique los permisos.');
            closeCamera();
        }
    }

    function closeCamera() {
        // Detener stream
        if (cameraStream) {
            cameraStream.getTracks().forEach(track => track.stop());
            cameraStream = null;
        }
        
        // Ocultar cámara, mostrar formulario
        cameraInterface.style.display = 'none';
        modalBody.style.display = 'block';
    }

    function takePhoto() {
        if (!cameraVideo.srcObject) return;

        // Configurar canvas para recorte cuadrado 1:1
        const videoWidth = cameraVideo.videoWidth;
        const videoHeight = cameraVideo.videoHeight;
        
        // Determinar el lado del cuadrado (el lado más pequeño)
        const size = Math.min(videoWidth, videoHeight);
        
        // Calcular offsets para centrar el recorte
        const startX = (videoWidth - size) / 2;
        const startY = (videoHeight - size) / 2;
        
        // Ajustar tamaño del canvas
        cameraCanvas.width = size;
        cameraCanvas.height = size;
        
        const ctx = cameraCanvas.getContext('2d');
        
        // Si el video tiene scale(-1) en CSS, necesitamos dibujarlo invertido si es la frontal
        // o normal si es la trasera. Por simplicidad dibujamos lo que viene del stream.
        // Dibujar imagen recortada
        ctx.drawImage(cameraVideo, startX, startY, size, size, 0, 0, size, size);
        
        // Obtener base64
        const imageData = cameraCanvas.toDataURL('image/png');
        
        // Preparar envío
        uploadPhoto(imageData);
    }

    async function uploadPhoto(base64Image) {
        const folio = document.getElementById('folio').value;
        const cursoSelect = document.getElementById('curso');
        const curso = cursoSelect.options[cursoSelect.selectedIndex].text; // Obtener texto del select

        if (!folio || !curso) {
            alert('Error: No se pudo identificar el folio o el curso.');
            return;
        }

        try {
            const response = await fetch('/api/admin/save-photo', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    folio: folio,
                    curso: curso,
                    image: base64Image
                })
            });

            const result = await response.json();

            if (result.success) {
                alert('Fotografía guardada exitosamente.');
                closeCamera();
            } else {
                alert('Error al guardar: ' + result.message);
            }

        } catch (error) {
            console.error('Error subiendo foto:', error);
            alert('Error de conexión al guardar la foto.');
        }
    }

    // Event Listeners
    searchBtn.addEventListener('click', filterTable);
    searchInput.addEventListener('keyup', (event) => {
        if (event.key === 'Enter') filterTable();
    });

    prevBtn.addEventListener('click', () => {
        if (currentPage > 1) { currentPage--; renderTable(); }
    });

    nextBtn.addEventListener('click', () => {
        const totalPages = Math.ceil(filteredData.length / rowsPerPage);
        if (currentPage < totalPages) { currentPage++; renderTable(); }
    });

    importUsersBtn.addEventListener('click', importUsers);
    exportUsersBtn.addEventListener('click', exportUsers);
    importFilesBtn.addEventListener('click', importFiles);
    exportFilesBtn.addEventListener('click', exportFiles);
    importDocsBtn.addEventListener('click', importDocs);
    exportDocsBtn.addEventListener('click', exportDocs);

    csvFileInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        const type = csvFileInput.getAttribute('data-type');
        if (file) handleFileImport(file, type);
        csvFileInput.value = '';
    });

    closeModalBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            userModal.style.display = 'none';
            closeCamera(); // Asegurar que la cámara se apague si cierran el modal
        });
    });

    window.addEventListener('click', (event) => {
        if (event.target === userModal) {
            userModal.style.display = 'none';
            closeCamera();
        }
    });

    // Eventos de Cámara
    openCameraBtn.addEventListener('click', startCamera);
    closeCameraBtn.addEventListener('click', closeCamera);
    takePhotoBtn.addEventListener('click', takePhoto);

    userForm.addEventListener('submit', handleFormSubmit);
    attachRowEvents();
});