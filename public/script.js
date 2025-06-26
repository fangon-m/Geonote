        // Game state
        let currentUser = null;
        let notes = [];
        let pendingNotePosition = null;
        let dailyQuota = 0;
        
        // Zoom and pan state
        let zoom = 1;
        let panX = 0;
        let panY = 0;
        let isDragging = false;
        let lastMouseX = 0;
        let lastMouseY = 0;

        // Canvas setup
        const canvas = document.getElementById('gameCanvas');
        const ctx = canvas.getContext('2d');
        
        function resizeCanvas() {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight - 80;
            drawNotes();
        }

        // Zoom and pan functions
        function zoomIn() {
            zoom = Math.min(zoom * 1.2, 5);
            updateZoomInfo();
            drawNotes();
        }

        function zoomOut() {
            zoom = Math.max(zoom / 1.2, 0.1);
            updateZoomInfo();
            drawNotes();
        }

        function resetView() {
            zoom = 1;
            panX = 0;
            panY = 0;
            updateZoomInfo();
            drawNotes();
        }

        function updateZoomInfo() {
            document.getElementById('zoomInfo').textContent = `Zoom: ${Math.round(zoom * 100)}%`;
        }

        function worldToScreen(worldX, worldY) {
            return {
                x: (worldX + panX) * zoom,
                y: (worldY + panY) * zoom
            };
        }

        function screenToWorld(screenX, screenY) {
            return {
                x: screenX / zoom - panX,
                y: screenY / zoom - panY
            };
        }

        // Initialize
        window.addEventListener('resize', resizeCanvas);
        resizeCanvas();

        // Mock backend API (in real implementation, these would be actual HTTP calls)
        const api = {
            baseURL: window.location.origin + '/api',
            
            getAuthToken() {
                return localStorage.getItem('authToken');
            },
            
            setAuthToken(token) {
                localStorage.setItem('authToken', token);
            },
            
            removeAuthToken() {
                localStorage.removeItem('authToken');
            },
            
            async request(endpoint, options = {}) {
                const token = this.getAuthToken();
                const headers = {
                    'Content-Type': 'application/json',
                    ...options.headers
                };
                
                if (token) {
                    headers.Authorization = `Bearer ${token}`;
                }
                
                const response = await fetch(`${this.baseURL}${endpoint}`, {
                    ...options,
                    headers
                });
                
                const data = await response.json();
                
                if (!response.ok) {
                    throw new Error(data.error || 'Request failed');
                }
                
                return data;
            },

            async register(username, email, password) {
                const result = await this.request('/auth/register', {
                    method: 'POST',
                    body: JSON.stringify({ username, email, password })
                });
                
                if (result.token) {
                    this.setAuthToken(result.token);
                }
                
                return result;
            },

            async login(username, password) {
                const result = await this.request('/auth/login', {
                    method: 'POST',
                    body: JSON.stringify({ username, password })
                });
                
                if (result.token) {
                    this.setAuthToken(result.token);
                }
                
                return result;
            },

            async getNotes() {
                return await this.request('/notes');
            },

            async createNote(content, x, y) {
                return await this.request('/notes', {
                    method: 'POST',
                    body: JSON.stringify({ content, x, y })
                });
            },

            async getDailyQuota() {
                const quota = await this.request('/user/quota');
                return quota.used;
            }
        };

        // Authentication functions
        async function register() {
            const username = document.getElementById('registerUsername').value;
            const email = document.getElementById('registerEmail').value;
            const password = document.getElementById('registerPassword').value;

            try {
                const result = await api.register(username, email, password);
                currentUser = result.user;
                updateUI();
                hideModal('registerModal');
                await loadNotes();
            } catch (error) {
                alert(error.message);
            }
        }

        async function login() {
            const username = document.getElementById('loginUsername').value;
            const password = document.getElementById('loginPassword').value;

            try {
                const result = await api.login(username, password);
                currentUser = result.user;
                updateUI();
                hideModal('loginModal');
                await loadNotes();
            } catch (error) {
                alert(error.message);
            }
        }

        function logout() {
            currentUser = null;
            api.removeAuthToken();
            updateUI();
        }

        // Check if user is already logged in on page load
        function checkAuthStatus() {
            const token = api.getAuthToken();
            if (token) {
                // Verify token by making a request to get quota
                api.getDailyQuota()
                    .then(() => {
                        // Token is valid, decode user info from token
                        try {
                            const payload = JSON.parse(atob(token.split('.')[1]));
                            currentUser = { id: payload.id, username: payload.username };
                            updateUI();
                        } catch (error) {
                            console.error('Invalid token format');
                            api.removeAuthToken();
                        }
                    })
                    .catch(() => {
                        // Token is invalid, remove it
                        api.removeAuthToken();
                    });
            }
        }

        async function updateUI() {
            const authButtons = document.getElementById('authButtons');
            const quotaDisplay = document.getElementById('quotaDisplay');
            const logoutBtn = document.getElementById('logoutBtn');

            if (currentUser) {
                authButtons.style.display = 'none';
                quotaDisplay.style.display = 'block';
                logoutBtn.style.display = 'block';
                
                dailyQuota = await api.getDailyQuota();
                document.getElementById('quotaCount').textContent = dailyQuota;
            } else {
                authButtons.style.display = 'flex';
                quotaDisplay.style.display = 'none';
                logoutBtn.style.display = 'none';
            }
        }

        // Notes functions
        async function loadNotes() {
            notes = await api.getNotes();
            drawNotes();
        }

        function drawNotes() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            // Save context for transformations
            ctx.save();
            
            // Apply zoom and pan transformations
            ctx.scale(zoom, zoom);
            ctx.translate(panX, panY);
            
            // Draw grid (optional)
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.05)';
            ctx.lineWidth = 1 / zoom; // Adjust line width for zoom
            
            const gridSize = 50;
            const startX = Math.floor(-panX / gridSize) * gridSize;
            const endX = Math.ceil((canvas.width / zoom - panX) / gridSize) * gridSize;
            const startY = Math.floor(-panY / gridSize) * gridSize;
            const endY = Math.ceil((canvas.height / zoom - panY) / gridSize) * gridSize;
            
            for (let x = startX; x <= endX; x += gridSize) {
                ctx.beginPath();
                ctx.moveTo(x, startY);
                ctx.lineTo(x, endY);
                ctx.stroke();
            }
            
            for (let y = startY; y <= endY; y += gridSize) {
                ctx.beginPath();
                ctx.moveTo(startX, y);
                ctx.lineTo(endX, y);
                ctx.stroke();
            }

            // Draw notes
            notes.forEach((note, index) => {
                drawNote(note, index);
            });
            
            // Restore context
            ctx.restore();
        }

        function drawNote(note, index) {
            const colors = ['#ffeb3b', '#ff9800', '#4caf50', '#2196f3', '#e91e63'];
            const color = colors[index % colors.length];
            
            const noteWidth = 150;
            const noteHeight = 100;
            
            // Use the correct coordinate property names from the database
            const x = note.x_coordinate || note.x;
            const y = note.y_coordinate || note.y;
            
            ctx.fillStyle = color;
            ctx.fillRect(x - noteWidth/2, y - noteHeight/2, noteWidth, noteHeight);
            
            ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
            ctx.fillRect(x - noteWidth/2 + 2, y - noteHeight/2 + 2, noteWidth - 4, noteHeight - 4);
            
            // Only show text when zoomed in enough (zoom level > 0.5)
            if (zoom > 0.5) {
                ctx.fillStyle = '#333';
                ctx.font = `${14 / zoom}px Arial`; // Adjust font size for zoom
                ctx.textAlign = 'center';
                
                const words = note.content.split(' ');
                const lines = [];
                let currentLine = '';
                const maxWidth = (noteWidth - 20) / zoom;
                
                words.forEach(word => {
                    const testLine = currentLine + word + ' ';
                    const metrics = ctx.measureText(testLine);
                    if (metrics.width > maxWidth && currentLine !== '') {
                        lines.push(currentLine);
                        currentLine = word + ' ';
                    } else {
                        currentLine = testLine;
                    }
                });
                lines.push(currentLine);
                
                const lineHeight = 18 / zoom;
                const startY = y - (lines.length - 1) * lineHeight / 2;
                
                lines.forEach((line, i) => {
                    ctx.fillText(line.trim(), x, startY + (i * lineHeight));
                });
            }
        }

        async function createNote(content) {
            if (!currentUser) {
                showModal('loginModal');
                return;
            }

            if (dailyQuota >= 10) {
                alert('You have reached your daily limit of 10 notes!');
                return;
            }

            try {
                const note = await api.createNote(content, pendingNotePosition.x, pendingNotePosition.y);
                notes.push(note);
                drawNotes();
                
                dailyQuota++;
                document.getElementById('quotaCount').textContent = dailyQuota;
                
                hideModal('noteModal');
            } catch (error) {
                alert(error.message);
            }
        }

        // Event listeners
        canvas.addEventListener('mousedown', (e) => {
            const rect = canvas.getBoundingClientRect();
            const screenX = e.clientX - rect.left;
            const screenY = e.clientY - rect.top;

            if (e.button === 0) { // Left mouse button
                if (e.shiftKey) {
                    // Shift + click to pan
                    isDragging = true;
                    lastMouseX = screenX;
                    lastMouseY = screenY;
                    canvas.style.cursor = 'grabbing';
                } else {
                    // Regular click to place note
                    const worldPos = screenToWorld(screenX, screenY);

                    if (!currentUser) {
                        showModal('registerModal');
                        return;
                    }

                    if (dailyQuota >= 10) {
                        alert('You have reached your daily limit of 10 notes!');
                        return;
                    }

                    pendingNotePosition = { x: worldPos.x, y: worldPos.y };
                    showModal('noteModal');
                }
            }
        });

        canvas.addEventListener('mousemove', (e) => {
            const rect = canvas.getBoundingClientRect();
            const screenX = e.clientX - rect.left;
            const screenY = e.clientY - rect.top;
            const worldPos = screenToWorld(screenX, screenY);
            
            document.getElementById('coordinates').textContent = `x: ${Math.round(worldPos.x)}, y: ${Math.round(worldPos.y)}`;

            if (isDragging) {
                const deltaX = (screenX - lastMouseX) / zoom;
                const deltaY = (screenY - lastMouseY) / zoom;
                
                panX += deltaX;
                panY += deltaY;
                
                lastMouseX = screenX;
                lastMouseY = screenY;
                
                drawNotes();
            }
        });

        canvas.addEventListener('mouseup', (e) => {
            if (isDragging) {
                isDragging = false;
                canvas.style.cursor = 'grab';
            }
        });

        canvas.addEventListener('mouseleave', (e) => {
            if (isDragging) {
                isDragging = false;
                canvas.style.cursor = 'grab';
            }
        });

        // Mouse wheel zoom
        canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            
            const rect = canvas.getBoundingClientRect();
            const screenX = e.clientX - rect.left;
            const screenY = e.clientY - rect.top;
            const worldPos = screenToWorld(screenX, screenY);
            
            const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
            const newZoom = Math.max(0.1, Math.min(5, zoom * zoomFactor));
            
            if (newZoom !== zoom) {
                // Zoom towards mouse cursor
                panX = worldPos.x - screenX / newZoom;
                panY = worldPos.y - screenY / newZoom;
                zoom = newZoom;
                
                updateZoomInfo();
                drawNotes();
            }
        });

        // Form submissions
        document.getElementById('loginForm').addEventListener('submit', (e) => {
            e.preventDefault();
            login();
        });

        document.getElementById('registerForm').addEventListener('submit', (e) => {
            e.preventDefault();
            register();
        });

        document.getElementById('noteForm').addEventListener('submit', (e) => {
            e.preventDefault();
            const content = document.getElementById('noteContent').value;
            createNote(content);
        });

        // Modal functions
        function showModal(modalId) {
            document.getElementById(modalId).style.display = 'flex';
        }

        function hideModal(modalId) {
            document.getElementById(modalId).style.display = 'none';
            if (modalId === 'noteModal') {
                document.getElementById('noteContent').value = '';
            }
        }

        // Close modal when clicking outside
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    hideModal(modal.id);
                }
            });
        });

        // Initialize app
        loadNotes();
        updateUI();
        updateZoomInfo();