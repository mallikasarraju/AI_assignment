import React, { useState } from 'react';
import axios from 'axios';
import './App.css';

function App() {
  const [userQuery, setUserQuery] = useState('');
  const [botResponse, setBotResponse] = useState('');
  const [files, setFiles] = useState([]);
  const [chatHistory, setChatHistory] = useState([]);
  const [showFileInput, setShowFileInput] = useState(false);

  const handleInputChange = (e) => {
    setUserQuery(e.target.value);
  };

  const handleFileChange = (e) => {
    const uploadedFiles = Array.from(e.target.files);
    setFiles(uploadedFiles);
  };

  const handleSendQuery = async () => {
    if(userQuery==''){
      return;
    }
    try {
      if (files.length > 0) {
        console.log('Files exist');
        // If PDF files are uploaded, learn from them and then respond to user queries
        await learnFromPDFs(files);

        // Reset the files state to an empty array after learning
        setFiles([]);
      }

      // Send user query to the server
      const response = await axios.post('http://localhost:3001/api/chat', { query: userQuery });
      console.log('Query: ' + userQuery);

      // Update chat history with the user query and bot response
      setChatHistory((prevHistory) => [
        ...prevHistory,
        { role: 'You', content: userQuery },
        { role: 'Bot', content: response.data.botResponse },
      ]);

      // Update bot response in the state
      setBotResponse(response.data.botResponse);
      setUserQuery('');

    } catch (error) {
      console.error('Error sending query:', error);
    }
  };

  const handleUploadFiles = () => {
    // Toggle the visibility of the file input
    setShowFileInput(!showFileInput);
  };

  const learnFromPDFs = async (pdfFiles) => {
    try {
      const formData = new FormData();

      // Append each PDF file to the form data
      for (const file of pdfFiles) {
        formData.append('pdfs', file);
      }

      // Send the PDF files to the server for learning
      await axios.post('http://localhost:3001/api/learn', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      console.log('PDFs sent:', pdfFiles);
    } catch (error) {
      console.error('Error learning from PDFs:', error);
    }
  };

  const handleKeyDown = (e) => {
    // Check if the "Enter" key is pressed (key code 13)
    if (e.key === 'Enter') {
      handleSendQuery();
    }
  };

  return (
    <div className="app-container">
      <div>
        <h2>ChatBot</h2>
        <div className="uploaded-files">
        {files.length > 0 && (
          <div>
            <strong>Uploaded Files:</strong>
            <ul>
              {files.map((file, index) => (
                <li key={index}>{file.name}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
      </div>
      <div className="chat-history">
        {chatHistory.map((message, index) => (
          <div key={index}>
            <strong>{message.role}:</strong> {message.content}
          </div>
        ))}
      </div>
      <div className="user-input-section">
        <input id='query' type="text" value={userQuery} onChange={handleInputChange} onKeyDown={handleKeyDown} placeholder="Type your message..." />
        <button id='send' onClick={handleSendQuery}>Send</button>
        <div className="file-upload-section">
          {showFileInput && <input type="file" onChange={handleFileChange} multiple />}
          <button onClick={handleUploadFiles}>{showFileInput ? 'Close':'Upload'}</button>
        </div>
      </div>
    </div>
  );
}

export default App;