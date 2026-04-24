pipeline {
    agent any
    
    tools {
        nodejs 'node-18'
    }
    
    environment {
        DOCKER_COMPOSE = 'docker-compose'
        APP_NAME = 'todo-app'
    }
    
    stages {
        stage('Checkout') {
            steps {
                echo 'Checking out code...'
                // This would checkout from git in production
                // git url: 'https://github.com/your-repo/todo-app.git'
            }
        }
        
        stage('Install Dependencies') {
            steps {
                echo 'Installing Node.js dependencies...'
                sh 'npm install express mongoose prom-client'
            }
        }
        
        stage('Run Tests') {
            steps {
                echo 'Running tests...'
                // Add your tests here
                sh 'echo "Tests passing!"'
            }
        }
        
        stage('Build Docker Image') {
            steps {
                echo 'Building Docker image...'
                sh '''
                    docker build -t todo-app:latest .
                '''
            }
        }
        
        stage('Deploy with Docker Compose') {
            steps {
                echo 'Deploying application...'
                sh '''
                    cd ~/todo_app
                    docker-compose down todo-app
                    docker-compose up -d todo-app
                '''
            }
        }
        
        stage('Health Check') {
            steps {
                echo 'Checking application health...'
                sh '''
                    sleep 10
                    curl -f http://localhost:3000 || exit 1
                    curl -f http://localhost:3000/metrics || exit 1
                '''
            }
        }
        
        stage('Deploy to Production') {
            when {
                branch 'main'
            }
            steps {
                echo 'Deploying to production...'
                sh '''
                    # Push to container registry
                    docker tag todo-app:latest your-registry/todo-app:latest
                    docker push your-registry/todo-app:latest
                    
                    # Deploy to production server
                    ssh prod-server "cd /app && docker-compose pull && docker-compose up -d"
                '''
            }
        }
    }
    
    post {
        success {
            echo 'Pipeline succeeded! Application deployed successfully.'
            // Send notification
            sh 'curl -X POST -H "Content-Type: application/json" -d "{\"status\":\"success\"}" http://localhost:3000/metrics || true'
        }
        failure {
            echo 'Pipeline failed! Check logs for details.'
            // Send alert
            sh 'curl -X POST -H "Content-Type: application/json" -d "{\"status\":\"failure\"}" http://localhost:3000/metrics || true'
        }
    }
}
