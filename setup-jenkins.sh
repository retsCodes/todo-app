#!/bin/bash

echo "========================================="
echo "Setting up Jenkins for Todo App"
echo "========================================="

# Wait for Jenkins to start
echo "Waiting for Jenkins to start (this may take 2-3 minutes)..."
sleep 30

# Get initial admin password
echo ""
echo "Jenkins Initial Admin Password:"
docker exec todo_jenkins cat /var/jenkins_home/secrets/initialAdminPassword 2>/dev/null || echo "Check Jenkins logs"

echo ""
echo "========================================="
echo "Access Jenkins:"
echo "========================================="
echo ""
echo "URL: http://localhost:8080"
echo ""
echo "Setup Instructions:"
echo "1. Open http://localhost:8080 in your browser"
echo "2. Use the initial admin password above to login"
echo "3. Install suggested plugins"
echo "4. Create admin user"
echo "5. Set Jenkins URL to: http://localhost:8080"
echo "6. Create new Pipeline job"
echo "7. Set Pipeline script from SCM or use the Jenkinsfile in this directory"
echo ""
echo "========================================="
echo "Jenkins Pipeline Setup:"
echo "========================================="
echo ""
echo "To create a pipeline job:"
echo "1. Click 'New Item'"
echo "2. Enter name: 'todo-app-pipeline'"
echo "3. Select 'Pipeline'"
echo "4. Under 'Pipeline' section:"
echo "   - Definition: 'Pipeline script from SCM'"
echo "   - SCM: 'None' (or 'Git' if you have a repo)"
echo "   - Or use 'Pipeline script' and copy the Jenkinsfile content"
echo ""
echo "Or use the Jenkins CLI to create job:"
echo "  java -jar jenkins-cli.jar -s http://localhost:8080 create-job todo-app-pipeline < Jenkinsfile"
echo ""

# Create a job configuration XML
cat > config.xml << 'XML'
<?xml version='1.1' encoding='UTF-8'?>
<flow-definition plugin="workflow-job@2.42">
  <actions/>
  <description>Todo App CI/CD Pipeline</description>
  <keepDependencies>false</keepDependencies>
  <properties/>
  <definition class="org.jenkinsci.plugins.workflow.cps.CpsFlowDefinition" plugin="workflow-cps@2.92">
    <script>pipeline {
    agent any
    
    stages {
        stage('Checkout') {
            steps {
                echo 'Checking out code...'
            }
        }
        
        stage('Install Dependencies') {
            steps {
                echo 'Installing dependencies...'
                sh 'cd /app && npm install'
            }
        }
        
        stage('Test') {
            steps {
                echo 'Running tests...'
                sh 'cd /app && npm test'
            }
        }
        
        stage('Deploy') {
            steps {
                echo 'Deploying application...'
                sh 'docker-compose restart todo-app'
            }
        }
        
        stage('Health Check') {
            steps {
                echo 'Checking health...'
                sh 'curl -f http://localhost:3000'
            }
        }
    }
    
    post {
        success {
            echo 'Deployment successful!'
        }
        failure {
            echo 'Deployment failed!'
        }
    }
}</script>
    <sandbox>true</sandbox>
  </definition>
  <triggers/>
  <disabled>false</disabled>
</flow-definition>
XML

echo "Job configuration file created: config.xml"
echo "Import it with:"
echo "  docker exec todo_jenkins java -jar /var/jenkins_home/war/WEB-INF/jenkins-cli.jar -s http://localhost:8080 create-job todo-app-pipeline < config.xml"

