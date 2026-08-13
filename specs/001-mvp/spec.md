# Especificación Funcional (Spec) - MVP SOS-911

## 1. Contexto y Problema
En el entorno urbano actual, la efectividad de un sistema de emergencia depende directamente de su tiempo de respuesta. El análisis de vulnerabilidad a perfiles de alta exposición (ej. caso de la Médica Veterinaria) demuestra una baja percepción de seguridad (2/5) y fallos estructurales de latencia en el servicio ECU911 durante el "minuto de oro".

El proyecto **SOS-911** busca neutralizar esta brecha de tiempo eliminando intermediarios y automatizando la cadena de alerta.

---

## 2. Requisitos Funcionales (RF)
- **RF-01: Perfil de Usuario (Local):** Permitir al usuario configurar su perfil básico (nombre, teléfono) almacenado de forma segura en el navegador (`localStorage`) para el MVP.
- **RF-02: Gestión de Contactos de Emergencia:** Registrar, editar y eliminar contactos de la red de apoyo que recibirán alertas. 
- **RF-03: Botón de Pánico:** Disponer de un botón central en la pantalla principal para iniciar el protocolo de emergencia con lógica de prevención de disparos accidentales (Panic Design).
- **RF-04: Geolocalización GPS:** Obtener la ubicación GPS del usuario mediante la API del navegador en tiempo real al activar la alerta.
- **RF-05: Historial de Emergencias:** Almacenar un registro temporal en el dispositivo con fecha, hora y estado de las alertas generadas.

---

## 3. Requisitos No Funcionales (RNF)
- **RNF-01 (Rendimiento):** El procesamiento de la alerta y captura de GPS no debe superar los 2 segundos a nivel de interfaz.
- **RNF-02 (Disponibilidad):** Mantenimiento de disponibilidad mínima del 99% mediante el hosting en Railway.
- **RNF-03 (Seguridad):** Uso obligatorio de protocolo seguro (HTTPS) para el despliegue público y protección de datos locales.
- **RNF-04 (Usabilidad / Panic Design):** Interfaz sencilla e intuitiva que permita activar alertas en máximo 2 interacciones, con alto contraste visual.
- **RNF-05 (Compatibilidad):** Diseño responsivo (Mobile-First) compatible con navegadores web modernos en dispositivos móviles (Chrome, Safari).