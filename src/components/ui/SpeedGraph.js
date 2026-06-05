import Component from '../Component.js';

export default class SpeedGraph extends Component {
    initialState() {
        return {
            historyLength: 60, // Keep the last 60 data points
            dataPoints: new Array(60).fill(0), // Start with a flat line
            maxSpeed: 1024 * 1024 * 10, // Default Y-axis max (10 MB/s), will auto-scale
            isRunning: false
        };
    }

    template() {
        // The canvas element must have explicit width and height attributes
        return `
            <div class="graph-container">
                <canvas id="speedCanvas" width="600" height="150" class="graph-canvas"></canvas>
      </div>
    `;
    }

    onMount() {
        this.canvas = this.element.querySelector('#speedCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.state.isRunning = true;

        // Kick off the highly optimized rendering loop
        this.renderLoop();
    }

    onUnmount() {
        this.state.isRunning = false; // Stops the requestAnimationFrame loop
    }

    /**
     * Called by the WebRTC sender/receiver every second with the new speed in bytes.
     */
    addSpeedData(bytesPerSecond) {
        const { dataPoints } = this.state;

        // Remove the oldest point and add the newest
        dataPoints.shift();
        dataPoints.push(bytesPerSecond);

        // Auto-scale the Y-axis if the speed exceeds our current maximum
        const currentMax = Math.max(...dataPoints);
        if (currentMax > this.state.maxSpeed) {
            this.state.maxSpeed = currentMax * 1.2; // Add 20% headroom
        }
    }

    /**
     * The animation loop synchronized with the display's refresh rate.
     */
    renderLoop() {
        if (!this.state.isRunning) return;

        this.drawGraph();

        // Schedule the next frame recursively
        requestAnimationFrame(this.renderLoop.bind(this));
    }

    /**
     * Core geometry math to map data to pixels.
     */
    drawGraph() {
        const { width, height } = this.canvas;
        const { dataPoints, maxSpeed } = this.state;

        // 1. Clear the previous frame entirely
        this.ctx.clearRect(0, 0, width, height);

        // 2. Setup styles (Sci-Fi Hacker aesthetics)
        this.ctx.strokeStyle = '#00ffcc'; // Neon Cyan
        this.ctx.lineWidth = 2;
        this.ctx.lineJoin = 'round';

        // Add a glowing effect
        this.ctx.shadowBlur = 10;
        this.ctx.shadowColor = '#00ffcc';

        // 3. Begin drawing the path
        this.ctx.beginPath();

        const stepX = width / (dataPoints.length - 1);

        for (let i = 0; i < dataPoints.length; i++) {
            const x = i * stepX;

            // Calculate Y: Invert it because Canvas Y=0 is at the top, but graph Y=0 is at the bottom
            const normalizedValue = dataPoints[i] / maxSpeed; // 0.0 to 1.0
            const y = height - (normalizedValue * height);

            if (i === 0) {
                this.ctx.moveTo(x, y);
            } else {
                this.ctx.lineTo(x, y);
            }
        }

        // 4. Stroke the line to the screen
        this.ctx.stroke();

        // 5. (Optional) Fill underneath the line with a gradient
        const gradient = this.ctx.createLinearGradient(0, 0, 0, height);
        gradient.addColorStop(0, 'rgba(0, 255, 204, 0.4)');
        gradient.addColorStop(1, 'rgba(0, 255, 204, 0.0)');

        this.ctx.lineTo(width, height);
        this.ctx.lineTo(0, height);
        this.ctx.fillStyle = gradient;
        this.ctx.fill();
    }
}
