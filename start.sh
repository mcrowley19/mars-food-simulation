#!/bin/bash
# start.sh (put this in your project root)

echo "Starting Mars Greenhouse..."

# Terminal 1 - backend
cd backend
uvicorn api:app --reload &
cd ..

# Terminal 2 - frontend  
cd frontend
npm run dev

# Run with
# chmod +x start.sh
#./start.sh