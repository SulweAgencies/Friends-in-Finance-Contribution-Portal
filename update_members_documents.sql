-- Update member_documents table with Google Drive URLs for photos and MOA documents

-- Clear existing documents to avoid duplicates
DELETE FROM member_documents WHERE member_email IN (
    'anneawuor20@gmail.com', 'arnnebelle2@yahoo.com', 'robertelmussy@gmail.com', 'ckithikii@gmail.com',
    'wakeshocharlotte@gmail.com', 'ndongaelsie@gmail.com', 'Njenga573@gmail.com', 'njengastellah@gmail.com',
    'priscillahmlumbasyo@gmail.com', 'owinovictor91@gmail.com', 'virginia.wmwaniki@gmail.com', 'vimanoti@gmail.com'
);

-- Insert photo documents
INSERT INTO member_documents (member_email, document_type, document_title, file_url) VALUES
('anneawuor20@gmail.com', 'photo', 'Anne_Kamwata.jpg', 'https://drive.google.com/file/d/1sZ5xusEvACBM7s3h4zrWXyp_kEOW6FjQ/view?usp=drive_link'),
('arnnebelle2@yahoo.com', 'photo', 'Annette_Awuor.PNG', 'https://drive.google.com/file/d/1W5Bs57QX4GyfG9ZtEjvzjsqo946JWZun/view?usp=drive_link'),
('robertelmussy@gmail.com', 'photo', 'Robert_ElMussy.png', 'https://drive.google.com/file/d/1rWMfojvaoRljeMEbT7wLWpOohLoQMMfy/view?usp=drive_link'),
('ckithikii@gmail.com', 'photo', 'Caleb_Kithikii.PNG', 'https://drive.google.com/file/d/1Ue3kLkw0we8XExaezHMBdcq6As7LycgS/view?usp=drive_link'),
('wakeshocharlotte@gmail.com', 'photo', 'Charlotte_Wakesho.png', 'https://drive.google.com/file/d/12D6rGpRbpS9-7USbl3twjiQ7LUMq3ASL/view?usp=drive_link'),
('ndongaelsie@gmail.com', 'photo', 'Elsie_Ndonga.png', 'https://drive.google.com/file/d/12D6rGpRbpS9-7USbl3twjiQ7LUMq3ASL/view?usp=drive_link'),
('Njenga573@gmail.com', 'photo', 'Nancy_Njenga.png', 'https://drive.google.com/file/d/1s5PYbAq1-01ilCN7cWGgqQt0m-4N5sN9/view?usp=drive_link'),
('njengastellah@gmail.com', 'photo', 'Rachael_Stella_Njenga.png', 'https://drive.google.com/file/d/1dWHr7qeVVwDh925Xd-qtlUDdggspUVd4/view?usp=drive_link'),
('priscillahmlumbasyo@gmail.com', 'photo', 'Vanessa_Mmbone.png', 'https://drive.google.com/file/d/1Lk-nsj96rrBxVY3WJ4qFy7tgf0Sro_uF/view?usp=drive_link'),
('owinovictor91@gmail.com', 'photo', 'Victor_Owino.png', 'https://drive.google.com/file/d/1KMX0-UpbmfSz88VajNyaFDLol8r0DKIJ/view?usp=drive_link'),
('virginia.wmwaniki@gmail.com', 'photo', 'Virginia_Mwaniki.png', 'https://drive.google.com/file/d/1Brt1YIwNTUAie63pTRc6oU2iZU-29ZIb/view?usp=drive_link'),
('vimanoti@gmail.com', 'photo', 'Admin.jpg', 'https://drive.google.com/file/d/1ViEsXNOrLVyCpOYWOLsZ44eF0OHAfOJ3/view?usp=drive_link');

-- Insert MOA documents
INSERT INTO member_documents (member_email, document_type, document_title, file_url) VALUES
('anneawuor20@gmail.com', 'mou', 'Anne_Signed_MOA', 'https://drive.google.com/file/d/1qv5YQTMzu9n4O52AFjERvjGM7MBz16MH/view?usp=drive_link'),
('arnnebelle2@yahoo.com', 'mou', 'Annette_Signed_MOA', 'https://drive.google.com/file/d/17dMRnMAggquP7xH-wpUEJ4IgQHBHjWT2/view?usp=drive_link'),
('robertelmussy@gmail.com', 'mou', 'Bob_Signed_MOA', 'https://drive.google.com/file/d/1P6B86uBP7EzB0YYM99Fn45XAVFTav9qL/view?usp=drive_link'),
('ckithikii@gmail.com', 'mou', 'Caleb_Signed_MOA', 'https://drive.google.com/file/d/1RuIuBNwMA3W6SUQt9fBYIO5Jt7c6u2F-/view?usp=drive_link'),
('wakeshocharlotte@gmail.com', 'mou', 'Charlotte_Signed_MOA', 'https://drive.google.com/file/d/1_U0aQMBNhh4cgb36UMll6Ht4s6WVI987/view?usp=drive_link'),
('Njenga573@gmail.com', 'mou', 'Nancy_Signed_MOA', 'https://drive.google.com/file/d/1_-NSoCqPnagQg0T-poaAQk2Mlt85hFFS/view?usp=drive_link'),
('njengastellah@gmail.com', 'mou', 'Rachael_Signed_MOA', 'https://drive.google.com/file/d/1RXZRjL6mo-XRQrLxYeC-YILxM9NEhU3j/view?usp=drive_link'),
('owinovictor91@gmail.com', 'mou', 'Victor_Signed_MOA', 'https://drive.google.com/file/d/1c_fQ1qJpYnljm8WhWVFtO0Qvg8q7dmQ1/view?usp=drive_link'),
('priscillahmlumbasyo@gmail.com', 'mou', 'Vanessa_Signed_MOA', 'https://drive.google.com/file/d/1M_44g3AVP7DAiXa86LeN-3ESSsX0dru1/view?usp=drive_link');

-- Verify the data was inserted
SELECT * FROM member_documents ORDER BY member_email, document_type;
