// QR Code Module for Camera Scanner & QR Code Generator
window.QRModule = {
    // Generate simple SVG QR Code for Admin printing
    generateQRCodeSVG: function(text) {
        // Quick clean SVG representation for sample QR codes
        const encoded = encodeURIComponent(text);
        return `
            <div style="text-align: center; padding: 15px; background: white; border-radius: 12px; display: inline-block;">
                <img src="https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encoded}" alt="QR Code" style="width: 160px; height: 160px; display: block; margin: 0 auto;">
                <p style="color: #000; font-size: 11px; font-weight: bold; margin-top: 8px; font-family: monospace;">${text}</p>
            </div>
        `;
    },

    // Open QR Camera Modal
    openScannerModal: function(onScanSuccess) {
        const modal = document.getElementById('qrModal');
        modal.classList.add('active');

        // Start Scanner simulation / HTML5 Camera
        this.startScanner(onScanSuccess);
    },

    // Close Modal
    closeScannerModal: function() {
        const modal = document.getElementById('qrModal');
        modal.classList.remove('active');
        if (window.qrStream) {
            window.qrStream.getTracks().forEach(track => track.stop());
        }
    },

    // Camera Scan Logic
    startScanner: function(onScanSuccess) {
        const video = document.getElementById('qrVideo');
        const simulatedBox = document.getElementById('qrSimulatedSelect');
        
        // Try accessing device camera
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
                .then(stream => {
                    window.qrStream = stream;
                    video.srcObject = stream;
                    video.play();
                })
                .catch(err => {
                    console.log("Camera access not available or denied, fallback to simulated select:", err);
                    if (simulatedBox) simulatedBox.style.display = 'block';
                });
        } else {
            if (simulatedBox) simulatedBox.style.display = 'block';
        }
    }
};
