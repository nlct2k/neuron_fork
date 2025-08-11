# Multiple Inference Servers Documentation

This document explains the changes made to enable multiple inference servers to run simultaneously with dynamic port detection, avoiding conflicts and allowing scalable deployment.

## Overview

The system now supports running multiple inference servers concurrently, each automatically detecting available ports while skipping reserved ports (5003 and 5004). Each server gets a unique Docker Compose project name and container name based on the model configuration.

## Key Features

- ✅ **Dynamic Port Detection**: Automatically finds available ports starting from 5002
- ✅ **Port Skipping**: Automatically skips ports 5003 and 5004 as requested
- ✅ **Unique Containers**: Each model gets its own container with unique naming
- ✅ **No Conflicts**: Multiple servers run independently without interfering
- ✅ **Backward Compatible**: Existing workflows continue to work
- ✅ **Management Commands**: New commands to monitor and control multiple servers

## Files Changed

### 1. `Makefile` (Primary Changes)

#### Modified Commands:

**`inference-localhost-dev`** (lines 138-180):
- Added dynamic port detection logic
- Added unique container and project naming
- Made dynamic ports the default behavior

**`inference-localhost-dev-gpu`** (lines 182-183):
- Updated to pass through all parameters to the main command

**`inference-list-configs`** (lines 189-197):
- Updated help text to reflect new behavior

#### Added Commands:

**`inference-status`** (lines 199-202):
```bash
inference-status: ## Inference: Show running inference servers and their ports
	@echo "Running Neuronpedia Inference Servers:"
	@echo "======================================"
	@docker ps --filter "name=neuronpedia-inference-" --format "table {{.Names}}\t{{.Image}}\t{{.Ports}}\t{{.Status}}" || echo "No inference servers running"
```

**`inference-stop-all`** (lines 204-206):
```bash
inference-stop-all: ## Inference: Stop all running inference servers  
	@echo "Stopping all neuronpedia inference servers..."
	@docker stop $$(docker ps -q --filter "name=neuronpedia-inference-") 2>/dev/null || echo "No inference servers to stop"
```

#### Key Implementation Details:

**Port Detection Logic** (lines 147-148):
```bash
PORT=$$(python3 -c "import socket; exec('def find_port():\\n    for p in range(5002, 65535):\\n        if p in [5003, 5004]: continue\\n        try:\\n            s = socket.socket(); s.bind((\\\"127.0.0.1\\\", p)); s.close(); return p\\n        except: continue\\n    return None\\nprint(find_port())')");
```

**Safe Naming Logic** (line 150):
```bash
SAFE_MODEL_NAME=$$(echo "$(MODEL_SOURCESET)" | sed 's/[^a-zA-Z0-9]/_/g' | tr '[:upper:]' '[:lower:]');
```

**Unique Project Names** (line 155):
```bash
export COMPOSE_PROJECT_NAME="neuronpedia_$$SAFE_MODEL_NAME";
```

### 2. `docker/compose.yaml` (Line 71)

**Modified Port Mapping**:
```yaml
ports:
  - "${COMPOSE_PORT_OVERRIDE:-5002:5002}"
```

This change allows the Makefile to override the port mapping dynamically while maintaining backward compatibility.

### 3. `apps/inference/start.py` (Enhanced but not required)

**Added port detection functions** (lines 16, 122-142):
```python
import socket

def is_port_in_use(port, host='127.0.0.1'):
    """Check if a port is already in use."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        try:
            s.bind((host, port))
            return False
        except OSError:
            return True

def find_next_available_port(start_port=5002, skip_ports=[5003, 5004]):
    """Find the next available port starting from start_port, skipping specified ports."""
    port = start_port
    while True:
        if port not in skip_ports and not is_port_in_use(port):
            return port
        port += 1
        if port > 65535:
            raise RuntimeError("No available ports found")
```

**Added auto-port argument** (lines 119-123):
```python
parser.add_argument(
    "--auto-port",
    action="store_true",
    help="Automatically detect next available port starting from --port (skips 5003, 5004)",
)
```

**Added auto-port logic** (lines 152-159):
```python
if args.auto_port:
    available_port = find_next_available_port(start_port=args.port)
    if available_port != args.port:
        print(f"Port {args.port} is in use, using port {available_port} instead")
        args.port = available_port
    else:
        print(f"Using requested port {args.port}")
```

## How It Works

### Port Assignment Logic

1. **First server**: Starts on port 5002 (if available)
2. **Subsequent servers**: Automatically detect next available port
3. **Reserved ports**: 5003 and 5004 are always skipped
4. **Port mapping**: External dynamic port → Internal 5002

### Container Naming

Each inference server gets unique names:
- **Container Name**: `neuronpedia-inference-{safe_model_name}`
- **Project Name**: `neuronpedia_{safe_model_name}`

Example for `MODEL_SOURCESET=gemma-2-2b-it.gemmascope-res-16k`:
- Container: `neuronpedia-inference-gemma_2_2b_it_gemmascope_res_16k`
- Project: `neuronpedia_gemma_2_2b_it_gemmascope_res_16k`

### Docker Architecture

```
External Port    Internal Port    Container
5002         →       5002         neuronpedia-inference-gpt2_small_res_jb
5005         →       5002         neuronpedia-inference-gemma_2_2b_gemmascope_res_16k
5006         →       5002         neuronpedia-inference-deepseek_r1_distill_llama_8b
```

## Usage Examples

### Start Multiple Servers

```bash
# Terminal 1: Start first server (will use port 5002)
make inference-localhost-dev MODEL_SOURCESET=gpt2-small.res-jb

# Terminal 2: Start second server (will use port 5005)
make inference-localhost-dev-gpu MODEL_SOURCESET=gemma-2-2b-it.gemmascope-res-16k USE_LOCAL_HF_CACHE=1

# Terminal 3: Start third server (will use port 5006)
make inference-localhost-dev MODEL_SOURCESET=deepseek-r1.llamascope-res-32k
```

### Management Commands

```bash
# Check running servers
make inference-status

# Stop all servers
make inference-stop-all

# List available configurations
make inference-list-configs
```

### Example Output

```bash
$ make inference-status
Running Neuronpedia Inference Servers:
======================================
NAMES                                              IMAGE                      PORTS                    STATUS
neuronpedia-inference-gpt2_small_res_jb           neuronpedia-inference      0.0.0.0:5002->5002/tcp  Up 2 minutes
neuronpedia-inference-gemma_2_2b_it_gemmascope    neuronpedia-inference      0.0.0.0:5005->5002/tcp  Up 1 minute
```

## Benefits

1. **Scalability**: Start as many servers as needed without manual port management
2. **Isolation**: Each server runs independently with its own container
3. **Simplicity**: No need to specify ports manually
4. **Safety**: Reserved ports are automatically avoided
5. **Management**: Easy monitoring and control of multiple servers
6. **Compatibility**: Existing workflows continue to work unchanged

## Technical Notes

### Why Internal Port is Always 5002

The inference application is hardcoded to bind to port 5002 internally. Docker port mapping handles the external port routing:

- **Good**: `5005->5002` (external 5005 routes to internal 5002 where app listens)
- **Bad**: `5005->5005` (external 5005 routes to internal 5005 where nothing listens)

This design keeps the application code simple while allowing flexible external port assignments.

### Docker Compose Project Names

Project names must follow Docker naming conventions:
- Only lowercase letters, numbers, and underscores
- No hyphens, dots, or special characters
- Must start with letter or number

The safe naming logic handles this conversion automatically.

## Troubleshooting

### Port Detection Issues
If port detection fails, ensure Python 3 is available and the socket module works correctly.

### Container Name Conflicts
If you see Docker name conflicts, check for existing containers:
```bash
docker ps -a --filter "name=neuronpedia-inference-"
```

### Project Name Issues
If Docker Compose complains about project names, verify the name contains only valid characters (letters, numbers, underscores).

## Future Enhancements

- Auto-discovery of running servers with health checks
- Load balancing across multiple inference servers
- Resource monitoring and management
- Configuration-based server management

---

**Created**: January 2025  
**Last Updated**: January 2025  
**Authors**: Assistant & User Collaboration
