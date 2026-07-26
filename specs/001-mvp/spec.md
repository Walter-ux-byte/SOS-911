# Especificación Funcional (Spec) - MVP SOS-911

## 1. Contexto y Problema
En el entorno urbano actual, la efectividad de un sistema de emergencia depende directamente de su tiempo de respuesta.El análisis de vulnerabilidad a perfiles de alta exposición (ej. caso de la Médica Veterinaria) demuestra una baja percepción de seguridad (2/5) y fallos estructurales de latencia en el servicio ECU911 durante el "minuto de oro".

El proyecto **SOS-911** busca neutralizar esta brecha de tiempo eliminando intermediarios y automatizando la cadena de alerta.

---

## 2. Requisitos Funcionales (RF)
- **RF-01: Registro de Usuarios:** Permitir a los usuarios registrarse mediante nombre, correo electrónico, número telefónico y contraseña.
- **RF-02: Gestión de Contactos de Emergencia:** Registrar, editar y eliminar contactos de la red de apoyo que recibirán alertas automáticas.
- **RF-03: Botón de Pánico:** Disponer de un botón central en la pantalla principal para iniciar el protocolo de emergencia con lógica de prevención de disparos accidentales.
- **RF-04: Geolocalización GPS:** Obtener y transmitir la ubicación GPS del usuario en tiempo real mientras la emergencia permanezca activa.
- **RF-05: Historial de Emergencias:** Almacenar un historial con fecha, hora, ubicación y estado de las alertas generadas.

---

## 3. Requisitos No Funcionales (RNF)
- **RNF-01 (Rendimiento):** El envío de alertas no debe superar los 2 segundos.
- **RNF-02 (Disponibilidad):** Mantenimiento de disponibilidad mínima del 99%.
- **RNF-03 (Seguridad):** Cifrado de datos y protocolos de comunicación seguros.
- **RNF-04 (Usabilidad / Panic Design):** Interfaz sencilla e intuitiva que permita activar alertas en máximo 2 interacciones.
- **RNF-05 (Compatibilidad):** Compatible con Android 10 o superior.