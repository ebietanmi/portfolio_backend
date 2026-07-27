import dotenv from 'dotenv'
import mysql2 from 'mysql2';
import bcrypt from 'bcrypt'
import { response } from 'express';
dotenv.config();


// const pool = mysql2.createPool({
//     host: process.env.MYSQL_HOST,
//     user: process.env.MYSQL_USER,
//     password: process.env.MYSQL_PASSWORD,
//     database: process.env.MYSQL_DATABASE,
//     waitForConnections: true,
//     connectionLimit: 10
// }).promise();

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set');
}

const pool = mysql2.createPool({
    uri: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
}
).promise();



// Creates database schema for adding projects on first use.
async function createProjectSchema(pool) {
    const query = `CREATE TABLE project_table (
    id INT PRIMARY KEY AUTO_INCREMENT,
    project_title VARCHAR(255) NOT NULL,
    project_author VARCHAR(255) DEFAULT "No Author",
    project_description TEXT,
    project_date_created DATETIME DEFAULT NOW(),
    project_img_url VARCHAR(255),
    project_public_id VARCHAR(255)
)`
    pool.query(query)
}
// Creates database schema for adding blogs on first use.
async function createBlogSchema(pool) {
    const query = `CREATE TABLE blog_table (
    id INT PRIMARY KEY AUTO_INCREMENT,
    blog_title VARCHAR(255) NOT NULL,
    blog_excerpt VARCHAR(255) DEFAULT "No excerpt",
    blog_content TEXT,
    blog_creation_date DATETIME DEFAULT NOW(),
    blog_category VARCHAR(255) NOT NULL,
    blog_img_url VARCHAR(255),
    blog_public_id VARCHAR(255)
)`
    pool.query(query)
}
// Creates database schema for adding admin on first use.
async function createAdminSchema(pool) {
    const query = `CREATE TABLE admin_table (
    id INT PRIMARY KEY AUTO_INCREMENT,
    username VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    role    VARCHAR(255) NOT NULL DEFAULT "user"
)`
    pool.query(query)
}
// Creates database schema for recieved mail.
async function createRecievedMailSchema(pool) {
    const query = `CREATE TABLE recieved_email_table (
    id INT PRIMARY KEY AUTO_INCREMENT,
    sender_name VARCHAR(255) NOT NULL,
    sender_email VARCHAR(255) NOT NULL,
    subject VARCHAR(255) DEFAULT 'Message from portfolio website',
    message    VARCHAR(255) NOT NULL
)`
    pool.query(query)
}



// Creates admin profile on first use.
async function createPrimaryAdmin(pool) {
    const hashedPassword = await bcrypt.hash('admin', 10)
    createUserSQL('admin', hashedPassword, 'admin')
}


//Checks if database exists? does nothing of it exists and create a database if it deoes not!
async function ensureDatabaseExists() {
    const database = process.env.MYSQL_DATABASE;
    const connenction = await mysql2.createConnection({
        host: process.env.MYSQL_HOST,
        user: process.env.MYSQL_USER,
        password: process.env.MYSQL_PASSWORD,
    }).promise()

    const [rows] = await connenction.execute(`SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME = ?`, [database]);
    if (rows.length === 0) {
        await connenction.execute(`CREATE DATABASE\`${database}\``)
        const pool = mysql2.createPool({
            host: process.env.MYSQL_HOST,
            user: process.env.MYSQL_USER,
            password: process.env.MYSQL_PASSWORD,
            database: process.env.MYSQL_DATABASE,
            waitForConnections: true,
            connectionLimit: 10
        }).promise()
        await createAdminSchema(pool);
        await createProjectSchema(pool);
        await createPrimaryAdmin(pool);
        await createRecievedMailSchema(pool);
        await createBlogSchema(pool);
    } else {
        null;
    }
    await connenction.end();
}
ensureDatabaseExists()

export async function createUserSQL(username, password, role) {
    const query = `INSERT INTO admin_table (username, password, role) VALUES (?, ?, ?)`;
    try {
        const [response] = await pool.query(query, [username, password, role]);
        if (response.affectedRows > 0) {
            return { 'ok': true, "SQLMessage": 'User created succesfully', 'insertId': response.insertId }
        }
        else {
            return { 'ok': false, "SQLMessage": 'Failed to create user' }
        }
    } catch (error) {
        if (error instanceof Error) {
            if (error.errno === 1062) {
                return { 'ok': false, 'taken': true, "SQLMessage": 'Username is already taken' }
            } else {
                return { 'ok': false, "SQLMessage": error }
            }
        }
    }
}

export async function getUsersSQL() {
    const query = 'SELECT * FROM admin_table';
    const [users] = await pool.query(query);
    if (users.length > 0) { return users } else { return { "SQLMessage": 'No user found' } }
}

export async function getUserSQL(id) {
    const query = `SELECT * FROM admin_table WHERE id = ?`;
    const [user] = await pool.query(query, [id])
    if (user.length > 0) { return user } else { return { "SQLMessage": 'No user found' } }
}

export async function updatePasswordSQL(id, password) {
    const query = 'UPDATE admin_table SET password = ? WHERE id = ?'
    const [response] = await pool.query(query, [password, id]);
    if (response.affectedRows > 0) {
        return { "SQLMessage": 'Password Update Sucessful', 'ok': true }

    } else {
        return { "SQLMessage": 'Password Update Failed', 'ok': false }
    }
}

export async function checkUserSQL(username) {
    const query = "SELECT id, password FROM admin_table WHERE username = ?";
    const [rows] = await pool.query(query, [username]);
    if (rows.length > 0) { return rows[0] }
    else return { "SQLMessage": 'User not found' };
}

export async function createProjectSQL(project_title, project_author,
    project_description, project_img_url, project_public_id) {
    const query = `INSERT INTO project_table ( 
    project_title,
    project_author,
    project_description, 
    project_img_url,
    project_public_id
    ) 
    VALUES(?,?,?,?,?)`;
    const [response] = await pool.query(
        query, [project_title, project_author, project_description, project_img_url, project_public_id]
    );
    return response;
}


export async function createBlogSQL({ blog_title, blog_excerpt, blog_content,
    blog_creation_date, blog_category, blog_img_url, blog_public_id }) {
    const query = `INSERT INTO blog_table ( 
    blog_title,
    blog_excerpt,
    blog_content,
    blog_creation_date,
    blog_category,
    blog_img_url,
    blog_public_id
    ) 
    VALUES(?,?,?,?,?,?,?)`;
    const [response] = await pool.query(
        query, [blog_title, blog_excerpt, blog_content, blog_creation_date, blog_category, blog_img_url, blog_public_id]
    );
    return response;
}

export async function getBlogsSQL() {
    const query = `SELECT * FROM blog_table`;
    try {
        const [blogs] = await pool.query(query);
        if (blogs.length > 0) {
            return blogs;
        } else return { "SQLMessage": 'No Blog found' };
    }
    catch (error) {
        return error;
    }

}

export async function getProjectSQL(id) {
    const query = 'SELECT * FROM project_table WHERE id = ?';
    try {
        const [project] = await pool.query(query, [id]);
        if (project.length > 0) {
            return project
        } else {
            return { "SQLMessage": `No Matching Project` }
        }
    } catch (error) {
        return { "SQLMessage": `Unable to retrieve project with error : ${error}` }
    }
}

export async function getProjectsSQL() {
    const query = `SELECT * FROM project_table`;
    try {
        const [projects] = await pool.query(query);
        if (projects.length > 0) {
            return projects;
        } else return { "SQLMessage": 'No projects found' };
    }
    catch (error) {
        return error;
    }

}
export async function deleteProjectSQL(id) {
    const query = `DELETE FROM project_table WHERE id = ?`;
    try {
        const [response] = await pool.query(query, [id]);
        if (response.affectedRows > 0) {
            return { "SQLMessage": 'Project Deleted', "ok": true }
        }
        else {
            return { "SQLMessage": 'Project not Deleted', "ok": false }
        }
    } catch (error) {
        return { "SQLMessage": error, "ok": false };
    }
}

export async function createRecievedMailSQL(sender_name, sender_email, subject, message) {
    const query = `INSERT INTO recieved_email_table ( 
    sender_name,
    sender_email,
    subject,
    message
    ) 
    VALUES(?,?,?,?)`;
    const [result] = await pool.query(
        query, [sender_name, sender_email, subject, message]
    );
    if (result.affectedRows > 0) {
        return { "SQLMessage": 'Message sent saved', "ok": true }
    }
    else {
        return { "SQLMessage": 'Message not saved', "ok": false }
    }

    return result;
}