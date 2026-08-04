import dotenv from 'dotenv'
import mysql2 from 'mysql2/promise'; 
import bcrypt from 'bcrypt'
dotenv.config();

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set');
}

// Creating database pool
const pool = mysql2.createPool({
    uri: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    waitForConnections: true,
    connectionLimit: 10
});

// Run migrations only once on startup
export async function ensureDatabaseExists() {
    try {
        await pool.execute('SELECT 1');
        console.log('DB Connected');
        await createAdminSchema();
        await createProjectSchema();
        await createBlogSchema();
        await createRecievedMailSchema();
        await createPrimaryAdmin();

    } catch (err) {
        console.error('DB Init failed:', err.errno);
        process.exit(1);
    }
}

// All schema functions now use the global pool and IF NOT EXISTS
async function createProjectSchema() {
    const query = `CREATE TABLE IF NOT EXISTS project_table (
    id INT PRIMARY KEY AUTO_INCREMENT,
    project_title VARCHAR(255) NOT NULL,
    project_author VARCHAR(255) DEFAULT "No Author",
    project_description TEXT,
    project_date_created DATETIME DEFAULT NOW(),
    project_img_url VARCHAR(255),
    project_public_id VARCHAR(255)
)`
    await pool.query(query)
}

async function createBlogSchema() {
    const query = `CREATE TABLE IF NOT EXISTS blog_table (
    id INT PRIMARY KEY AUTO_INCREMENT,
    blog_title VARCHAR(255) NOT NULL,
    blog_excerpt VARCHAR(255) DEFAULT "No excerpt",
    blog_content TEXT,
    blog_creation_date DATETIME DEFAULT NOW(),
    blog_category VARCHAR(255) NOT NULL,
    blog_img_url VARCHAR(255),
    blog_public_id VARCHAR(255)
)`
    await pool.query(query)
}

async function createAdminSchema() {
    const query = `CREATE TABLE IF NOT EXISTS admin_table (
    id INT PRIMARY KEY AUTO_INCREMENT,
    username VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(255) NOT NULL DEFAULT "user"
)`
    await pool.query(query)
}

async function createRecievedMailSchema() {
    const query = `CREATE TABLE IF NOT EXISTS recieved_email_table (
    id INT PRIMARY KEY AUTO_INCREMENT,
    sender_name VARCHAR(255) NOT NULL,
    sender_email VARCHAR(255) NOT NULL,
    subject VARCHAR(255) DEFAULT 'Message from portfolio website',
    message TEXT NOT NULL
)`
    await pool.query(query)
}

// 4. Check if admin exists before creating
async function createPrimaryAdmin() {
    const existing = await pool.query('SELECT id FROM admin_table WHERE username =?', ['admin']);
    if (existing[0].length === 0) {
        const hashedPassword = await bcrypt.hash('admin', 10)
        await createUserSQL('admin', hashedPassword, 'admin')
        console.log('Default admin created: admin/admin');
    }
}

// 5. All your SQL functions stay the same but use global pool
export async function createUserSQL(username, password, role) {
    const query = `INSERT INTO admin_table (username, password, role) VALUES (?,?,?)`;
    try {
        const [response] = await pool.query(query, [username, password, role]);
        if (response.affectedRows > 0) {
            return { 'ok': true, "SQLMessage": 'User created succesfully', 'insertId': response.insertId }
        }
        else {
            return { 'ok': false, "SQLMessage": 'Failed to create user' }
        }
    } catch (error) {
        if (error.errno === 1062) {
            return { 'ok': false, 'taken': true, "SQLMessage": 'Username is already taken' }
        } else {
            return { 'ok': false, "SQLMessage": error.message }
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
    const [response] = await pool.query(
        query, [sender_name, sender_email, subject, message]
    );
    if (result.affectedRows > 0) {
        console.log(response);
        return { "SQLMessage": 'Message sent saved', "ok": true }
    }
    else {
        console.log(response)
        return { "SQLMessage": 'Message not saved', "ok": false }
    }

    return result;
}

export { pool };
